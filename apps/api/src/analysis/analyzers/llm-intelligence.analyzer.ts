import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { LlmService, FileAnalysisContext, ProjectCacheContext } from '../services/llm.service';
import {
  FileRegistryEntry,
  DependencyGraph,
  ApiSurface,
  DataModel,
  ProjectMetadata,
  LlmIntelligence,
  FileCategory,
} from '../analysis.interfaces';

const LLM_ELIGIBLE_CATEGORIES: Set<FileCategory> = new Set([
  'api-route',
  'service',
  'schema',
  'page',
  'middleware',
  'config',
]);

const LLM_EXCLUDED_CATEGORIES: Set<FileCategory> = new Set([
  'test',
  'documentation',
  'static-asset',
  'unknown',
  'migration',
]);

const MAX_CONCURRENT_LLM = 5;
const MAX_FILE_LINES = 300;

interface AnalysisResult {
  updatedRegistry: FileRegistryEntry[];
  llmIntelligence: LlmIntelligence | null;
}

@Injectable()
export class LlmIntelligenceAnalyzer {
  private readonly logger = new Logger(LlmIntelligenceAnalyzer.name);

  constructor(private llmService: LlmService) {}

  async analyze(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
    dependencyGraph: DependencyGraph,
    apiSurface: ApiSurface,
    dataModel: DataModel,
    projectMetadata: ProjectMetadata,
  ): Promise<AnalysisResult> {
    if (!this.llmService.isAvailable()) {
      this.logger.warn('LLM not available — skipping LLM analysis');
      return { updatedRegistry: fileRegistry, llmIntelligence: null };
    }

    // Select files for LLM analysis
    const selectedFiles = this.selectFiles(
      fileRegistry,
      dependencyGraph,
      projectMetadata,
    );

    this.logger.log(`Selected ${selectedFiles.length} files for LLM analysis`);

    // Build shared project context for prompt caching.
    // This context is sent as system messages with cache_control and stays
    // the same across all per-file calls. Anthropic caches it after the
    // first call — subsequent calls read from cache at 90% discount.
    this.llmService.resetCacheStats();
    const projectCacheContext = this.buildProjectCacheContext(
      selectedFiles,
      projectMetadata,
      apiSurface,
      dependencyGraph,
    );
    const systemCache = this.llmService.buildFileAnalysisSystemCache(projectCacheContext);

    // Per-file LLM analysis with concurrency limit
    const updatedRegistry = [...fileRegistry];
    const fileLlmResults: { path: string; llm: NonNullable<FileRegistryEntry['llm']> }[] = [];

    const batches = this.chunk(selectedFiles, MAX_CONCURRENT_LLM);

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const context = await this.buildFileContext(
            repoPath,
            file,
            apiSurface,
            dataModel,
          );

          const llmResult = await this.llmService.generateFileAnalysisWithCache(context, systemCache);
          return { path: file.path, llmResult };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.llmResult) {
          const { path, llmResult } = result.value;

          // Update the registry entry with LLM data
          const idx = updatedRegistry.findIndex((f) => f.path === path);
          if (idx !== -1) {
            updatedRegistry[idx] = { ...updatedRegistry[idx], llm: llmResult };
          }

          fileLlmResults.push({ path, llm: llmResult });
        }
      }
    }

    // Log prompt cache efficiency
    const cacheStats = this.llmService.getCacheStats();
    this.logger.log(
      `LLM analysis complete: ${fileLlmResults.length} files. ` +
      `Cache stats — writes: ${cacheStats.writes}, reads: ${cacheStats.reads}, ` +
      `tokens served from cache: ${cacheStats.readTokens}`,
    );

    // Project-level LLM analysis
    let llmIntelligence: LlmIntelligence | null = null;
    if (fileLlmResults.length > 0) {
      llmIntelligence = await this.llmService.generateProjectAnalysis({
        fileLlmResults,
        projectMetadata: projectMetadata as unknown as Record<string, unknown>,
        apiSummary: {
          routeCount: apiSurface.routes.length,
          externalCallCount: apiSurface.externalCalls.length,
        },
      });
    }

    return { updatedRegistry, llmIntelligence };
  }

  /** Build shared project context for Anthropic prompt caching. */
  private buildProjectCacheContext(
    selectedFiles: FileRegistryEntry[],
    projectMetadata: ProjectMetadata,
    apiSurface: ApiSurface,
    dependencyGraph: DependencyGraph,
  ): ProjectCacheContext {
    return {
      projectMetadata: projectMetadata as unknown as Record<string, unknown>,
      fileMap: selectedFiles.map((f) => ({
        path: f.path,
        category: f.category,
        imports: f.imports.internal,
        exports: f.exports.map((e) => e.name),
      })),
      apiRoutes: apiSurface.routes.map((r) => ({ method: r.method, path: r.path })),
      dependencyGraphSummary: {
        totalEdges: dependencyGraph.edges.length,
        circularDeps: dependencyGraph.circularDependencies.length,
        orphanCount: dependencyGraph.orphans.length,
      },
    };
  }

  private selectFiles(
    fileRegistry: FileRegistryEntry[],
    dependencyGraph: DependencyGraph,
    projectMetadata: ProjectMetadata,
  ): FileRegistryEntry[] {
    const selected: FileRegistryEntry[] = [];
    const entryPointSet = new Set(projectMetadata.entryPoints);

    for (const file of fileRegistry) {
      // Eligible by category
      if (LLM_ELIGIBLE_CATEGORIES.has(file.category)) {
        selected.push(file);
        continue;
      }

      // Eligible by entry point
      if (entryPointSet.has(file.path)) {
        selected.push(file);
        continue;
      }

      // Eligible by blast radius > 10 (unless excluded category)
      if (LLM_EXCLUDED_CATEGORIES.has(file.category)) continue;

      const blastRadius = dependencyGraph.blastRadius[file.path] || 0;
      if (blastRadius > 10) {
        selected.push(file);
      }
    }

    return selected;
  }

  private async buildFileContext(
    repoPath: string,
    file: FileRegistryEntry,
    apiSurface: ApiSurface,
    dataModel: DataModel,
  ): Promise<FileAnalysisContext> {
    let content = '';
    try {
      const fullContent = await readFile(join(repoPath, file.path), 'utf-8');
      const lines = fullContent.split('\n');
      content = lines.slice(0, MAX_FILE_LINES).join('\n');
      if (lines.length > MAX_FILE_LINES) {
        content += `\n// ... truncated (${lines.length} total lines)`;
      }
    } catch {
      content = '// Unable to read file';
    }

    // Find routes for this file
    const routes = apiSurface.routes
      .filter((r) => r.handlerFile === file.path)
      .map((r) => ({ path: r.path, method: r.method }));

    // Find schemas for this file
    const schemas = dataModel.schemas
      .filter((s) => {
        // Match schemas from the same file/directory
        return file.path.includes('/schema/') || file.path.includes('/models/');
      })
      .map((s) => ({
        name: s.name,
        columns: s.columns,
      }));

    return {
      filePath: file.path,
      category: file.category,
      content,
      imports: file.imports,
      exports: file.exports.map((e) => ({
        name: e.name,
        type: e.type,
        kind: e.kind,
      })),
      routes: routes.length > 0 ? routes : undefined,
      schemas: schemas.length > 0 ? schemas : undefined,
    };
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
