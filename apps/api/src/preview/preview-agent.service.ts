import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { AnalysisService } from '../analysis/analysis.service';
import {
  FileRegistryEntry,
  DependencyGraph,
} from '../analysis/analysis.interfaces';
import { GitHubService } from '../github/github.service';
import { UsersService } from '../users/users.service';
import { ProjectsService } from '../projects/projects.service';
import { PreviewService } from './preview.service';
import { PREVIEW_EVENTS } from './preview.constants';
import { PreviewChangePayload, DiffBlock } from './preview.interfaces';

interface PageContext {
  pageTitle?: string;
  nearestHeading?: string;
  parentContext?: string;
  outerHtml?: string;
}

interface LlmResponse {
  targetFilePath: string;
  modifiedContent: string;
  diff: DiffBlock[];
  changeSummary: string;
}

@Injectable()
export class PreviewAgentService {
  private readonly logger = new Logger(PreviewAgentService.name);
  private client: Anthropic | null = null;
  private readonly model: string;
  private readonly maxRetries = 2;

  constructor(
    private configService: ConfigService,
    @Inject(DRIZZLE) private db: DrizzleDB,
    private analysisService: AnalysisService,
    private githubService: GitHubService,
    private usersService: UsersService,
    private projectsService: ProjectsService,
    private previewService: PreviewService,
  ) {
    const apiKey = this.configService.get<string>('LLM_API_KEY');
    this.model = this.configService.get<string>('LLM_MODEL', 'claude-sonnet-4-5-20250929');

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Preview agent LLM initialized');
    } else {
      this.logger.warn('LLM_API_KEY not set — preview agent will fail gracefully');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  @OnEvent(PREVIEW_EVENTS.CHANGE_SUBMITTED)
  async handleChangeSubmitted(payload: PreviewChangePayload): Promise<void> {
    this.logger.log(`Processing preview change ${payload.changeId}`);

    try {
      if (!this.isAvailable()) {
        await this.previewService.updateChange(payload.changeId, {
          status: 'failed',
          errorMessage: 'AI service unavailable',
        });
        return;
      }

      const change = await this.previewService.findById(
        payload.changeId,
        payload.projectId,
      );

      const analysis = await this.analysisService.findByProjectId(payload.projectId);
      if (!analysis || analysis.status !== 'completed') {
        await this.previewService.updateChange(payload.changeId, {
          status: 'failed',
          errorMessage: 'Run codebase analysis first',
        });
        return;
      }

      const project = await this.projectsService.findById(payload.projectId);
      if (!project?.githubOwner || !project?.githubRepoName) {
        await this.previewService.updateChange(payload.changeId, {
          status: 'failed',
          errorMessage: 'Project missing GitHub info',
        });
        return;
      }

      // Find a user with GitHub token in this project's org
      const userId = await this.findUserWithGithubToken(project.orgId);
      if (!userId) {
        await this.previewService.updateChange(payload.changeId, {
          status: 'failed',
          errorMessage: 'GitHub connection required',
        });
        return;
      }

      const token = await this.usersService.getGithubToken(userId);
      if (!token) {
        await this.previewService.updateChange(payload.changeId, {
          status: 'failed',
          errorMessage: 'GitHub token expired',
        });
        return;
      }

      await this.processChange(payload.changeId, payload.projectId, change, analysis, project, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Preview change ${payload.changeId} failed: ${message}`,
      );

      await this.previewService.updateChange(payload.changeId, {
        status: 'failed',
        errorMessage: message,
      });
    }
  }

  async processChangeWithToken(
    changeId: string,
    projectId: string,
    token: string,
  ): Promise<void> {
    const change = await this.previewService.findById(changeId, projectId);

    const analysis = await this.analysisService.findByProjectId(projectId);
    if (!analysis || analysis.status !== 'completed') {
      await this.previewService.updateChange(changeId, {
        status: 'failed',
        errorMessage: 'Run codebase analysis first',
      });
      return;
    }

    const project = await this.projectsService.findById(projectId);
    if (!project?.githubOwner || !project?.githubRepoName) {
      await this.previewService.updateChange(changeId, {
        status: 'failed',
        errorMessage: 'Project missing GitHub info',
      });
      return;
    }

    if (!this.isAvailable()) {
      await this.previewService.updateChange(changeId, {
        status: 'failed',
        errorMessage: 'AI service unavailable',
      });
      return;
    }

    await this.processChange(changeId, projectId, change, analysis, project, token);
  }

  private async processChange(
    changeId: string,
    projectId: string,
    change: Awaited<ReturnType<PreviewService['findById']>>,
    analysis: NonNullable<Awaited<ReturnType<AnalysisService['findByProjectId']>>>,
    project: NonNullable<Awaited<ReturnType<ProjectsService['findById']>>>,
    token: string,
  ): Promise<void> {
    const pageContext = change.pageContext as PageContext | null;

    const candidateFiles = await this.findCandidateFiles(
      token,
      project.githubOwner!,
      project.githubRepoName!,
      analysis,
      change.currentUrl,
      change.elementText,
      pageContext,
    );
    this.logger.log(`Found ${candidateFiles.length} candidate files`);

    const fileContents = await this.fetchFileContents(
      token,
      project.githubOwner!,
      project.githubRepoName!,
      project.githubDefaultBranch ?? 'main',
      candidateFiles,
    );
    this.logger.log(`Fetched ${fileContents.length} file contents`);

    const m3Context = this.buildM3Context(analysis);

    const result = await this.generateChange(
      m3Context,
      fileContents,
      change.elementText,
      change.cssSelector ?? '',
      change.tagName,
      change.currentUrl,
      change.requestedChange,
      pageContext,
    );

    const originalFile = fileContents.find(
      (f) => f.path === result.targetFilePath,
    );

    await this.previewService.updateChange(changeId, {
      status: 'ready',
      targetFilePath: result.targetFilePath,
      originalContent: originalFile?.content ?? null,
      modifiedContent: result.modifiedContent,
      diff: result.diff,
      changeSummary: result.changeSummary,
    });

    this.logger.log(`Preview change ${changeId} ready: ${result.targetFilePath}`);
  }

  private async findUserWithGithubToken(orgId: string): Promise<string | null> {
    const rows = await this.db.execute(
      sql`SELECT om.user_id FROM org_members om
          INNER JOIN github_tokens gt ON gt.user_id = om.user_id
          WHERE om.org_id = ${orgId}
          LIMIT 1`,
    );
    const result = rows.rows?.[0] as { user_id: string } | undefined;
    return result?.user_id ?? null;
  }

  private findCandidateFilesDeterministic(
    analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>,
    currentUrl: string,
    elementText: string,
  ): string[] {
    const candidates = new Set<string>();

    const urlPath = (() => {
      try {
        return new URL(currentUrl).pathname;
      } catch {
        return '/';
      }
    })();

    // Search API surface routes for matching URL patterns
    if (analysis?.apiSurface) {
      const api = analysis.apiSurface as {
        routes?: Array<{ path: string; handlerFile?: string }>;
      };

      if (api.routes) {
        for (const route of api.routes) {
          if (
            route.handlerFile &&
            (route.path === urlPath ||
              urlPath.startsWith(route.path) ||
              route.path.includes(urlPath.split('/').pop() ?? ''))
          ) {
            candidates.add(route.handlerFile);
          }
        }
      }
    }

    // Search file registry for page/component files
    if (analysis?.fileRegistry) {
      const files = analysis.fileRegistry as Array<{
        path: string;
        category?: string;
        llm?: { feature?: string; purpose?: string };
      }>;

      for (const file of files) {
        const pathSegments = urlPath.split('/').filter(Boolean);
        const filePathLower = file.path.toLowerCase();

        const isPageFile =
          file.category === 'page' ||
          file.category === 'component' ||
          filePathLower.includes('/pages/') ||
          filePathLower.includes('/app/') ||
          filePathLower.includes('/views/');

        if (isPageFile) {
          for (const segment of pathSegments) {
            if (segment && filePathLower.includes(segment.toLowerCase())) {
              candidates.add(file.path);
            }
          }
        }

        if (
          elementText.length > 3 &&
          file.llm?.purpose
            ?.toLowerCase()
            .includes(elementText.toLowerCase().slice(0, 30))
        ) {
          candidates.add(file.path);
        }
      }
    }

    // Search content structure for URL-matched pages
    if (analysis?.contentStructure) {
      const content = analysis.contentStructure as {
        pages?: Array<{ path?: string; filePath?: string; route?: string }>;
      };

      if (content.pages) {
        for (const page of content.pages) {
          if (
            page.filePath &&
            (page.route === urlPath || page.path === urlPath)
          ) {
            candidates.add(page.filePath);
          }
        }
      }
    }

    // Add fallback files if we have too few candidates
    if (candidates.size < 3 && analysis?.fileRegistry) {
      const files = analysis.fileRegistry as Array<{
        path: string;
        category?: string;
      }>;

      for (const file of files) {
        if (
          file.path.includes('index') ||
          file.path.includes('layout') ||
          file.path.includes('page.')
        ) {
          candidates.add(file.path);
          if (candidates.size >= 10) break;
        }
      }
    }

    return Array.from(candidates).slice(0, 10);
  }

  private async findCandidateFiles(
    token: string,
    owner: string,
    repo: string,
    analysis: NonNullable<Awaited<ReturnType<AnalysisService['findByProjectId']>>>,
    currentUrl: string,
    elementText: string,
    pageContext?: PageContext | null,
  ): Promise<string[]> {
    // Stage 1: GitHub Code Search
    const searchTerms = this.extractSearchTerms(elementText, pageContext);
    const searchHits = new Set<string>();

    const queries = searchTerms.slice(0, 2);
    for (const term of queries) {
      try {
        const results = await this.githubService.searchCode(
          token,
          owner,
          repo,
          term,
          20,
        );
        for (const item of results) {
          searchHits.add(item.path);
        }
        this.logger.log(
          `GitHub Code Search for "${term}" returned ${results.length} files`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`GitHub Code Search failed for "${term}": ${msg}`);
      }
    }

    if (searchHits.size === 0) {
      this.logger.log('Code search returned no results, using deterministic fallback');
      return this.findCandidateFilesDeterministic(analysis, currentUrl, elementText);
    }

    // Stage 2: Filter to frontend files via M3 registry
    const fileRegistry = (analysis.fileRegistry ?? []) as FileRegistryEntry[];
    const frontendFiles = this.filterFrontendFiles(
      Array.from(searchHits),
      fileRegistry,
    );
    this.logger.log(
      `Filtered to ${frontendFiles.length} frontend files (from ${searchHits.size} search hits)`,
    );

    // Stage 3: Dependency graph tracing
    const depGraph = analysis.dependencyGraph as DependencyGraph | null;
    let allFiles: string[];

    if (depGraph && frontendFiles.length > 0) {
      const traced = this.traceImports(frontendFiles, depGraph, fileRegistry);
      const merged = new Set([...frontendFiles, ...traced]);
      allFiles = Array.from(merged);
      this.logger.log(
        `Dependency trace added ${traced.length} related files (total: ${allFiles.length})`,
      );
    } else {
      allFiles = frontendFiles;
    }

    // Stage 4: Fallback if pipeline yielded nothing usable
    if (allFiles.length === 0) {
      this.logger.log('Pipeline yielded no frontend files, using deterministic fallback');
      return this.findCandidateFilesDeterministic(analysis, currentUrl, elementText);
    }

    return allFiles.slice(0, 15);
  }

  private extractSearchTerms(
    elementText: string,
    pageContext?: PageContext | null,
  ): string[] {
    const terms: string[] = [];
    const MAX_TERM_LENGTH = 60;

    // Split element text into sentence-like fragments.
    // textContent from DOM concatenates child nodes without delimiters,
    // so we split on sentence boundaries and camelCase-style joins
    // (e.g. "How It WorksPowerful AI" → ["How It Works", "Powerful AI"])
    if (elementText && elementText.length >= 4) {
      const fragments = this.splitTextFragments(elementText);

      for (const frag of fragments) {
        if (frag.length < 4) continue;
        const trimmed = frag.substring(0, MAX_TERM_LENGTH).trim();
        if (trimmed.length >= 10) {
          terms.push(`"${trimmed}"`);
        } else if (trimmed.length >= 4) {
          terms.push(trimmed);
        }
        // Cap at 3 fragments from element text
        if (terms.length >= 3) break;
      }
    }

    // Secondary: nearest heading (clean, usually a single phrase)
    if (
      terms.length < 3 &&
      pageContext?.nearestHeading &&
      pageContext.nearestHeading.length >= 4
    ) {
      const heading = pageContext.nearestHeading
        .substring(0, MAX_TERM_LENGTH)
        .trim();
      terms.push(`"${heading}"`);
    }

    // Tertiary: page title
    if (
      terms.length < 3 &&
      pageContext?.pageTitle &&
      pageContext.pageTitle.length >= 4
    ) {
      const title = pageContext.pageTitle
        .substring(0, MAX_TERM_LENGTH)
        .trim();
      terms.push(`"${title}"`);
    }

    // Fallback: first CSS class from outerHtml
    if (terms.length === 0 && pageContext?.outerHtml) {
      const classMatch = pageContext.outerHtml.match(/class="([^"]+)"/);
      if (classMatch) {
        const firstClass = classMatch[1].split(/\s+/)[0];
        if (firstClass && firstClass.length >= 4) {
          terms.push(firstClass);
        }
      }
    }

    return terms.slice(0, 3);
  }

  /**
   * Splits concatenated textContent into meaningful fragments.
   * Handles: sentence boundaries (. ! ?), and camelCase-style joins
   * where a lowercase letter is immediately followed by an uppercase
   * (e.g. "WorksPowerful" → "Works", "Powerful").
   */
  private splitTextFragments(text: string): string[] {
    // Insert a split marker before uppercase letters preceded by lowercase
    // This catches DOM textContent joins like "How It WorksPowerful AI"
    const separated = text.replace(/([a-z])([A-Z])/g, '$1|||$2');

    // Also split on sentence-ending punctuation
    const rawFragments = separated.split(/[.!?]+|\|\|\|/);

    return rawFragments
      .map((f) => f.trim())
      .filter((f) => f.length >= 4);
  }

  private traceImports(
    seedFiles: string[],
    depGraph: DependencyGraph,
    fileRegistry: FileRegistryEntry[],
  ): string[] {
    const validPaths = new Set(fileRegistry.map((f) => f.path));
    const MAX_DEPTH = 2;

    // Build adjacency maps once
    const forward = new Map<string, string[]>(); // file → what it imports
    const reverse = new Map<string, string[]>(); // file → what imports it

    for (const edge of depGraph.edges) {
      if (!forward.has(edge.source)) forward.set(edge.source, []);
      forward.get(edge.source)!.push(edge.target);

      if (!reverse.has(edge.target)) reverse.set(edge.target, []);
      reverse.get(edge.target)!.push(edge.source);
    }

    // BFS in both directions
    const visited = new Set<string>(seedFiles);
    let frontier = [...seedFiles];

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const nextFrontier: string[] = [];

      for (const file of frontier) {
        const neighbors = [
          ...(forward.get(file) ?? []),
          ...(reverse.get(file) ?? []),
        ];

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor) && validPaths.has(neighbor)) {
            visited.add(neighbor);
            nextFrontier.push(neighbor);
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }

    // Return only newly discovered files (exclude seeds)
    const seedSet = new Set(seedFiles);
    return Array.from(visited).filter((f) => !seedSet.has(f));
  }

  private filterFrontendFiles(
    filePaths: string[],
    fileRegistry: FileRegistryEntry[],
  ): string[] {
    const FRONTEND_CATEGORIES = new Set([
      'component',
      'page',
      'utility',
    ]);

    const EXCLUDED_CATEGORIES = new Set([
      'api-route',
      'service',
      'middleware',
      'config',
      'schema',
      'migration',
      'test',
    ]);

    const FRONTEND_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

    const registryMap = new Map<string, FileRegistryEntry>();
    for (const entry of fileRegistry) {
      registryMap.set(entry.path, entry);
    }

    return filePaths.filter((path) => {
      const entry = registryMap.get(path);

      if (!entry) {
        // Not in M3 registry — include if it has a frontend extension
        return FRONTEND_EXTENSIONS.some((ext) => path.endsWith(ext));
      }

      if (EXCLUDED_CATEGORIES.has(entry.category)) return false;
      if (FRONTEND_CATEGORIES.has(entry.category)) return true;

      // Include 'unknown' category if it has a frontend extension
      if (
        entry.category === 'unknown' &&
        FRONTEND_EXTENSIONS.some((ext) => path.endsWith(ext))
      ) {
        return true;
      }

      return false;
    });
  }

  private async fetchFileContents(
    token: string,
    owner: string,
    repo: string,
    ref: string,
    filePaths: string[],
  ): Promise<Array<{ path: string; content: string }>> {
    const results = await Promise.allSettled(
      filePaths.map(async (path) => {
        const fileContent = await this.githubService.getFileContent(
          token,
          owner,
          repo,
          path,
          ref,
        );

        const decoded = Buffer.from(fileContent.content, 'base64').toString(
          'utf-8',
        );
        const lines = decoded.split('\n');
        const truncated =
          lines.length > 200
            ? lines.slice(0, 200).join('\n') +
              `\n... (truncated, ${lines.length - 200} more lines)`
            : decoded;

        return { path, content: truncated };
      }),
    );

    const fetched: Array<{ path: string; content: string }> = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        fetched.push(result.value);
      } else {
        this.logger.warn(
          `Failed to fetch file: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`,
        );
      }
    }

    return fetched;
  }

  private buildM3Context(
    analysis: Awaited<ReturnType<AnalysisService['findByProjectId']>>,
  ): string {
    if (!analysis) return '';

    const sections: string[] = [];

    if (analysis.llmIntelligence) {
      const intel = analysis.llmIntelligence as {
        architectureSummary?: string;
        techStackNarrative?: string;
      };

      if (intel.architectureSummary) {
        sections.push(`Architecture:\n${intel.architectureSummary}`);
      }
      if (intel.techStackNarrative) {
        sections.push(`Tech Stack:\n${intel.techStackNarrative}`);
      }
    }

    if (analysis.patterns) {
      const pat = analysis.patterns as {
        namingConvention?: string;
      };
      if (pat.namingConvention) {
        sections.push(`Patterns:\n  Naming: ${pat.namingConvention}`);
      }
    }

    if (analysis.projectMetadata) {
      const meta = analysis.projectMetadata as {
        framework?: string;
        language?: string;
      };
      if (meta.framework || meta.language) {
        sections.push(
          `Project: ${meta.framework ?? ''} ${meta.language ?? ''}`.trim(),
        );
      }
    }

    return sections.join('\n\n');
  }

  private async generateChange(
    m3Context: string,
    fileContents: Array<{ path: string; content: string }>,
    elementText: string,
    cssSelector: string,
    tagName: string,
    currentUrl: string,
    requestedChange: string,
    pageContext?: PageContext | null,
  ): Promise<LlmResponse> {
    const promptParts: string[] = [
      `You are a code modification agent. Given information about a UI element on a deployed website and a requested change, identify the source file and generate the modified code.`,
    ];

    if (m3Context) {
      promptParts.push(`\nCodebase context:\n${m3Context}`);
    }

    if (fileContents.length > 0) {
      const codeBlocks = fileContents
        .map(
          (f) =>
            `--- ${f.path} ---\n${f.content}\n--- end ${f.path} ---`,
        )
        .join('\n\n');
      promptParts.push(`\nSource files:\n${codeBlocks}`);
    }

    promptParts.push(`
Respond with ONLY valid JSON (no markdown, no explanation):
{
  "targetFilePath": "path/to/file.tsx",
  "modifiedContent": "the complete modified file content",
  "diff": [
    {
      "filePath": "path/to/file.tsx",
      "language": "tsx",
      "hunks": [
        {
          "header": "@@ -10,5 +10,5 @@",
          "lines": [
            { "type": "context", "content": "unchanged line" },
            { "type": "remove", "content": "old line" },
            { "type": "add", "content": "new line" },
            { "type": "context", "content": "unchanged line" }
          ]
        }
      ]
    }
  ],
  "changeSummary": "Brief description of what was changed"
}

Rules:
- targetFilePath: the source file to modify (must be one of the files provided above)
- modifiedContent: the COMPLETE file content with the change applied
- diff: shows only the changed hunks with context lines around changes
- changeSummary: 1-2 sentence summary of the modification
- Preserve all existing code structure, imports, and formatting
- Only change what is necessary to fulfill the request
- If you cannot identify the correct file, use the most likely candidate`);

    const systemPrompt = promptParts.join('\n');

    // User-supplied requestedChange goes ONLY in user message, never in system prompt
    const userParts: string[] = [
      `Page URL: ${currentUrl}`,
      `Element: <${tagName}>${elementText}</${tagName}>`,
      `CSS selector: ${cssSelector || '(not available)'}`,
    ];

    if (pageContext?.pageTitle) {
      userParts.push(`Page title: ${pageContext.pageTitle}`);
    }
    if (pageContext?.nearestHeading) {
      userParts.push(`Nearest heading: ${pageContext.nearestHeading}`);
    }
    if (pageContext?.parentContext) {
      userParts.push(`Parent context: ${pageContext.parentContext}`);
    }
    if (pageContext?.outerHtml) {
      userParts.push(`Outer HTML: ${pageContext.outerHtml.substring(0, 500)}`);
    }

    userParts.push('', `Requested change: ${requestedChange}`);

    const userMessage = userParts.join('\n');

    const response = await this.callWithRetry(systemPrompt, userMessage);
    return this.parseResponse(response);
  }

  private async callWithRetry(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client!.messages.create({
          model: this.model,
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user' as const, content: userMessage }],
        });

        const textBlock = response.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('No text response from LLM');
        }

        return textBlock.text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          lastError.message.includes('429') ||
          lastError.message.includes('rate')
        ) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `Rate limited, retrying in ${delay}ms (attempt ${attempt}/${this.maxRetries})`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  }

  private parseResponse(response: string): LlmResponse {
    try {
      const cleaned = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;

      return {
        targetFilePath: String(parsed.targetFilePath || ''),
        modifiedContent: String(parsed.modifiedContent || ''),
        diff: Array.isArray(parsed.diff) ? (parsed.diff as DiffBlock[]) : [],
        changeSummary: String(
          parsed.changeSummary || 'Code modification applied.',
        ),
      };
    } catch {
      this.logger.warn('Failed to parse preview LLM response');
      throw new Error('Failed to parse AI response');
    }
  }
}
