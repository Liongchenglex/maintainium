import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { FileLlmResult, LlmIntelligence } from '../analysis.interfaces';

export interface FileAnalysisContext {
  filePath: string;
  category: string;
  content: string;
  imports: { internal: string[]; external: string[] };
  exports: { name: string; type: string; kind: string }[];
  routes?: { path: string; method: string }[];
  schemas?: { name: string; columns: { name: string; type: string }[] }[];
}

export interface ProjectAnalysisContext {
  fileLlmResults: { path: string; llm: FileLlmResult }[];
  projectMetadata: Record<string, unknown>;
  apiSummary: { routeCount: number; externalCallCount: number };
}

/** Shared project context for prompt caching across per-file LLM calls. */
export interface ProjectCacheContext {
  projectMetadata: Record<string, unknown>;
  fileMap: { path: string; category: string; imports: string[]; exports: string[] }[];
  apiRoutes: { method: string; path: string }[];
  dependencyGraphSummary: { totalEdges: number; circularDeps: number; orphanCount: number };
}

/** Anthropic system message block with optional cache_control. */
interface CacheableTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/** Options for the internal callWithRetry method. */
interface LlmCallOptions {
  system?: CacheableTextBlock[];
  userMessage: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private client: Anthropic | null = null;
  private readonly model: string;
  private readonly maxRetries = 3;
  private cacheStats = { writes: 0, reads: 0, readTokens: 0 };

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    this.model = this.configService.get<string>('LLM_MODEL', 'claude-sonnet-4-5-20250929');

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log(`LLM service initialized with model: ${this.model}`);
    } else {
      this.logger.warn('LLM_API_KEY not set — LLM analysis will be skipped');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Build reusable system cache blocks for per-file analysis.
   * These blocks contain shared project context that stays the same
   * across all per-file calls, enabling Anthropic prompt caching.
   *
   * Anthropic caches the system message on the first call (cache write:
   * 25% surcharge). Subsequent calls with the identical prefix hit the
   * cache (cache read: 90% discount). With 20-50 per-file calls sharing
   * the same context, the net saving is ~88%.
   *
   * Cache TTL is 5 minutes, refreshed on each hit. The cache lives on
   * Anthropic's servers — it is not browser-based or client-side.
   */
  buildFileAnalysisSystemCache(projectContext: ProjectCacheContext): CacheableTextBlock[] {
    const instructions = `You are a codebase analysis assistant. Analyze individual source files from a software project and produce structured JSON metadata.

For each file, respond with ONLY valid JSON (no markdown, no explanation):
{
  "purpose": "One-line description of what this file does",
  "businessContext": "What role this file plays in the application's business logic",
  "feature": "Feature name this file belongs to (e.g. authentication, github-connection, project-management)",
  "functions": [
    { "name": "functionName", "description": "One-line description of what this function does" }
  ]
}

Rules:
- "purpose" must be one concise sentence
- "businessContext" must explain the business role, not repeat the purpose
- "feature" must be a kebab-case feature name
- "functions" must list every exported function/method with a description
- If the file has no exported functions (e.g. type-only files), return an empty functions array`;

    const routeList = projectContext.apiRoutes.length > 0
      ? projectContext.apiRoutes.map((r) => `  ${r.method} ${r.path}`).join('\n')
      : '  (none detected)';

    const projectContextText = `Project context (use this to understand each file's role in the broader application):

Metadata: ${JSON.stringify(projectContext.projectMetadata)}

Files selected for analysis (${projectContext.fileMap.length} total):
${projectContext.fileMap.map((f) => `- ${f.path} [${f.category}] imports:${f.imports.length} exports:${f.exports.length}`).join('\n')}

API Routes:
${routeList}

Dependency Graph: ${projectContext.dependencyGraphSummary.totalEdges} edges, ${projectContext.dependencyGraphSummary.circularDeps} circular dependencies, ${projectContext.dependencyGraphSummary.orphanCount} orphans`;

    return [
      {
        type: 'text' as const,
        text: instructions,
        cache_control: { type: 'ephemeral' as const },
      },
      {
        type: 'text' as const,
        text: projectContextText,
        cache_control: { type: 'ephemeral' as const },
      },
    ];
  }

  /** Analyze a file without prompt caching (standalone call). */
  async generateFileAnalysis(context: FileAnalysisContext): Promise<FileLlmResult | null> {
    if (!this.client) return null;

    const prompt = this.buildFilePrompt(context);

    try {
      const response = await this.callWithRetry({ userMessage: prompt });
      return this.parseFileResponse(response);
    } catch (error) {
      this.logger.warn(`LLM file analysis failed for ${context.filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Analyze a file using cached system context for cost efficiency.
   * The systemCache blocks are built once via buildFileAnalysisSystemCache()
   * and reused across all per-file calls in a batch. Anthropic caches
   * these blocks after the first call (~90% cheaper on subsequent reads).
   */
  async generateFileAnalysisWithCache(
    context: FileAnalysisContext,
    systemCache: CacheableTextBlock[],
  ): Promise<FileLlmResult | null> {
    if (!this.client) return null;

    const userMessage = this.buildFileUserMessage(context);

    try {
      const response = await this.callWithRetry({
        system: systemCache,
        userMessage,
      });
      return this.parseFileResponse(response);
    } catch (error) {
      this.logger.warn(`LLM file analysis failed for ${context.filePath}: ${error}`);
      return null;
    }
  }

  async generateProjectAnalysis(context: ProjectAnalysisContext): Promise<LlmIntelligence | null> {
    if (!this.client) return null;

    const prompt = this.buildProjectPrompt(context);

    try {
      const response = await this.callWithRetry({ userMessage: prompt });
      return this.parseProjectResponse(response);
    } catch (error) {
      this.logger.warn(`LLM project analysis failed: ${error}`);
      return null;
    }
  }

  /** Returns cache hit/miss stats for the current analysis run. */
  getCacheStats(): { writes: number; reads: number; readTokens: number } {
    return { ...this.cacheStats };
  }

  /** Resets cache stats. Call at the start of each analysis run. */
  resetCacheStats(): void {
    this.cacheStats = { writes: 0, reads: 0, readTokens: 0 };
  }

  /** Build user message for per-file analysis (used with cached system context). */
  private buildFileUserMessage(context: FileAnalysisContext): string {
    const routeInfo = context.routes?.length
      ? `\nRoutes handled:\n${context.routes.map((r) => `  ${r.method} ${r.path}`).join('\n')}`
      : '';

    const schemaInfo = context.schemas?.length
      ? `\nSchemas defined:\n${context.schemas.map((s) => `  ${s.name}: ${s.columns.map((c) => c.name).join(', ')}`).join('\n')}`
      : '';

    return `Analyze this file:

File: ${context.filePath}
Category: ${context.category}
Imports (internal): ${context.imports.internal.join(', ') || 'none'}
Imports (external): ${context.imports.external.join(', ') || 'none'}
Exports: ${context.exports.map((e) => `${e.name} (${e.kind})`).join(', ') || 'none'}${routeInfo}${schemaInfo}

Source code:
\`\`\`
${context.content}
\`\`\``;
  }

  /** Build standalone prompt for per-file analysis (no caching). */
  private buildFilePrompt(context: FileAnalysisContext): string {
    const routeInfo = context.routes?.length
      ? `\nRoutes handled:\n${context.routes.map((r) => `  ${r.method} ${r.path}`).join('\n')}`
      : '';

    const schemaInfo = context.schemas?.length
      ? `\nSchemas defined:\n${context.schemas.map((s) => `  ${s.name}: ${s.columns.map((c) => c.name).join(', ')}`).join('\n')}`
      : '';

    return `Analyze this source file and provide structured metadata.

File: ${context.filePath}
Category: ${context.category}
Imports (internal): ${context.imports.internal.join(', ') || 'none'}
Imports (external): ${context.imports.external.join(', ') || 'none'}
Exports: ${context.exports.map((e) => `${e.name} (${e.kind})`).join(', ') || 'none'}${routeInfo}${schemaInfo}

Source code:
\`\`\`
${context.content}
\`\`\`

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "purpose": "One-line description of what this file does",
  "businessContext": "What role this file plays in the application's business logic",
  "feature": "Feature name this file belongs to (e.g. authentication, github-connection, project-management)",
  "functions": [
    { "name": "functionName", "description": "One-line description of what this function does" }
  ]
}

Rules:
- "purpose" must be one concise sentence
- "businessContext" must explain the business role, not repeat the purpose
- "feature" must be a kebab-case feature name
- "functions" must list every exported function/method with a description
- If the file has no exported functions (e.g. type-only files), return an empty functions array`;
  }

  private buildProjectPrompt(context: ProjectAnalysisContext): string {
    const fileSummaries = context.fileLlmResults
      .map((f) => `- ${f.path}: ${f.llm.purpose} [feature: ${f.llm.feature}]`)
      .join('\n');

    return `Analyze this project's architecture based on the file-level analysis results.

Project metadata: ${JSON.stringify(context.projectMetadata)}
API routes: ${context.apiSummary.routeCount}, External API calls: ${context.apiSummary.externalCallCount}

File analysis results:
${fileSummaries}

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "architectureSummary": "3-5 sentence overview of the application architecture",
  "businessFlows": [
    {
      "name": "Flow Name",
      "description": "Description of the end-to-end flow",
      "files": ["file1.ts", "file2.ts"]
    }
  ],
  "techStackNarrative": "Plain-language summary of tech stack and key architectural decisions"
}

Rules:
- architectureSummary must be 3-5 sentences covering the overall structure
- businessFlows must list 2-5 major end-to-end user flows detected from the file analysis
- Each flow's files must be ordered in execution order
- techStackNarrative must mention specific technologies and their roles`;
  }

  private async callWithRetry(options: LlmCallOptions): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client!.messages.create({
          model: this.model,
          max_tokens: 2048,
          ...(options.system?.length ? { system: options.system } : {}),
          messages: [{ role: 'user' as const, content: options.userMessage }],
        });

        // Track prompt cache usage (cache fields exist on API response
        // but may not be in the SDK's Usage type yet)
        this.trackCacheUsage(response.usage as unknown as Record<string, unknown>);

        const textBlock = response.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('No text response from LLM');
        }

        return textBlock.text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Retry on rate limit
        if (lastError.message.includes('429') || lastError.message.includes('rate')) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  }

  /** Track Anthropic prompt cache usage from response. */
  private trackCacheUsage(usage: Record<string, unknown>): void {
    const cacheCreation = usage.cache_creation_input_tokens;
    const cacheRead = usage.cache_read_input_tokens;

    if (typeof cacheCreation === 'number' && cacheCreation > 0) {
      this.cacheStats.writes++;
      this.logger.debug(`Prompt cache write: ${cacheCreation} tokens cached`);
    }

    if (typeof cacheRead === 'number' && cacheRead > 0) {
      this.cacheStats.reads++;
      this.cacheStats.readTokens += cacheRead;
      this.logger.debug(`Prompt cache hit: ${cacheRead} tokens from cache`);
    }
  }

  private parseFileResponse(response: string): FileLlmResult {
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    return {
      purpose: String(parsed.purpose || ''),
      businessContext: String(parsed.businessContext || ''),
      feature: String(parsed.feature || 'unknown'),
      functions: Array.isArray(parsed.functions)
        ? (parsed.functions as { name: string; description: string }[]).map((f) => ({
            name: String(f.name || ''),
            description: String(f.description || ''),
          }))
        : [],
    };
  }

  private parseProjectResponse(response: string): LlmIntelligence {
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    return {
      architectureSummary: String(parsed.architectureSummary || ''),
      businessFlows: Array.isArray(parsed.businessFlows)
        ? (parsed.businessFlows as { name: string; description: string; files: string[] }[]).map((f) => ({
            name: String(f.name || ''),
            description: String(f.description || ''),
            files: Array.isArray(f.files) ? f.files.map(String) : [],
          }))
        : [],
      techStackNarrative: String(parsed.techStackNarrative || ''),
    };
  }
}
