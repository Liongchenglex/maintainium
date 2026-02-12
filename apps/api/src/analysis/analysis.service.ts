import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import {
  codebaseAnalyses,
  CodebaseAnalysis,
} from '../database/schema';
import { UsersService } from '../users/users.service';
import { ProjectsService } from '../projects/projects.service';
import { RepoDownloaderService } from './services/repo-downloader.service';
import { LlmService } from './services/llm.service';
import { ProjectMetadataAnalyzer } from './analyzers/project-metadata.analyzer';
import { DependencyInventoryAnalyzer } from './analyzers/dependency-inventory.analyzer';
import { FileRegistryAnalyzer } from './analyzers/file-registry.analyzer';
import { DependencyGraphAnalyzer } from './analyzers/dependency-graph.analyzer';
import { ApiSurfaceAnalyzer } from './analyzers/api-surface.analyzer';
import { DataModelAnalyzer } from './analyzers/data-model.analyzer';
import { PatternsAnalyzer } from './analyzers/patterns.analyzer';
import { SecurityAnalyzer } from './analyzers/security.analyzer';
import { ContentStructureAnalyzer } from './analyzers/content-structure.analyzer';
import { LlmIntelligenceAnalyzer } from './analyzers/llm-intelligence.analyzer';
import { ANALYSIS_EVENTS } from './analysis.constants';
import { MONITOR_EVENTS } from '../monitor/monitor.constants';
import {
  ProjectCreatedPayload,
  ProjectPushedPayload,
  FileRegistryEntry,
} from './analysis.interfaces';

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private usersService: UsersService,
    private projectsService: ProjectsService,
    private repoDownloader: RepoDownloaderService,
    private llmService: LlmService,
    private eventEmitter: EventEmitter2,
    private projectMetadataAnalyzer: ProjectMetadataAnalyzer,
    private dependencyInventoryAnalyzer: DependencyInventoryAnalyzer,
    private fileRegistryAnalyzer: FileRegistryAnalyzer,
    private dependencyGraphAnalyzer: DependencyGraphAnalyzer,
    private apiSurfaceAnalyzer: ApiSurfaceAnalyzer,
    private dataModelAnalyzer: DataModelAnalyzer,
    private patternsAnalyzer: PatternsAnalyzer,
    private securityAnalyzer: SecurityAnalyzer,
    private contentStructureAnalyzer: ContentStructureAnalyzer,
    private llmIntelligenceAnalyzer: LlmIntelligenceAnalyzer,
  ) {}

  @OnEvent(ANALYSIS_EVENTS.PROJECT_CREATED)
  async handleProjectCreated(payload: ProjectCreatedPayload): Promise<void> {
    this.logger.log(`Project created: ${payload.projectId}, triggering analysis`);
    await this.runAnalysis(payload.projectId, payload.userId);
  }

  @OnEvent(ANALYSIS_EVENTS.PROJECT_PUSHED)
  async handleProjectPushed(payload: ProjectPushedPayload): Promise<void> {
    this.logger.log(`Push to default branch for project: ${payload.projectId}`);
    await this.runAnalysisForProject(payload.projectId);
  }

  @OnEvent(ANALYSIS_EVENTS.PROJECT_RESCAN)
  async handleRescan(payload: ProjectCreatedPayload): Promise<void> {
    this.logger.log(`Manual rescan for project: ${payload.projectId}`);
    await this.runAnalysis(payload.projectId, payload.userId);
  }

  async findByProjectId(projectId: string): Promise<CodebaseAnalysis | undefined> {
    const [analysis] = await this.db
      .select()
      .from(codebaseAnalyses)
      .where(eq(codebaseAnalyses.projectId, projectId));
    return analysis;
  }

  async runAnalysis(projectId: string, userId: string): Promise<void> {
    const startTime = Date.now();

    // Concurrency guard
    const existing = await this.findByProjectId(projectId);
    if (existing?.status === 'analyzing') {
      this.logger.warn(`Analysis already running for project ${projectId}, skipping`);
      return;
    }

    // Upsert analysis record
    await this.upsertAnalysis(projectId, {
      status: 'pending',
      errorMessage: null,
    });

    try {
      await this.upsertAnalysis(projectId, { status: 'analyzing' });

      // Get GitHub token
      const token = await this.usersService.getGithubToken(userId);
      if (!token) {
        throw new Error('GITHUB_TOKEN_EXPIRED');
      }

      // Get project details
      const project = await this.projectsService.findById(projectId);
      if (!project || !project.githubOwner || !project.githubRepoName) {
        throw new Error('REPO_NOT_ACCESSIBLE');
      }

      const ref = project.githubDefaultBranch || 'main';

      // Download and extract repo
      const { extractPath, cleanup } = await this.repoDownloader.downloadAndExtract(
        token,
        project.githubOwner,
        project.githubRepoName,
        ref,
      );

      try {
        // P0: Project metadata + dependency inventory + file registry
        this.logger.log(`Running P0 analyzers for project ${projectId}`);
        const projectMetadata = await this.projectMetadataAnalyzer.analyze(extractPath);
        const dependencyInventory = await this.dependencyInventoryAnalyzer.analyze(extractPath);
        const fileRegistry = await this.fileRegistryAnalyzer.analyze(extractPath);

        await this.upsertAnalysis(projectId, {
          projectMetadata,
          dependencyInventory,
          fileRegistry,
        });

        // P1: Dependency graph + API surface + data model
        this.logger.log(`Running P1 static analyzers for project ${projectId}`);
        const dependencyGraph = this.dependencyGraphAnalyzer.analyze(fileRegistry);
        const apiSurface = await this.apiSurfaceAnalyzer.analyze(extractPath, fileRegistry);
        const dataModel = await this.dataModelAnalyzer.analyze(extractPath, fileRegistry);

        await this.upsertAnalysis(projectId, {
          dependencyGraph,
          apiSurface,
          dataModel,
        });

        // P1 cont: LLM intelligence (graceful degradation)
        this.logger.log(`Running LLM analysis for project ${projectId}`);
        const { updatedRegistry, llmIntelligence } =
          await this.llmIntelligenceAnalyzer.analyze(
            extractPath,
            fileRegistry,
            dependencyGraph,
            apiSurface,
            dataModel,
            projectMetadata,
          );

        // P2: Patterns + security + content structure
        this.logger.log(`Running P2 analyzers for project ${projectId}`);
        const patterns = await this.patternsAnalyzer.analyze(extractPath, fileRegistry);
        const securityMetadata = await this.securityAnalyzer.analyze(extractPath, fileRegistry);
        const contentStructure = await this.contentStructureAnalyzer.analyze(
          extractPath,
          updatedRegistry,
          dependencyGraph,
        );

        const durationMs = Date.now() - startTime;

        await this.upsertAnalysis(projectId, {
          fileRegistry: updatedRegistry,
          patterns,
          securityMetadata,
          contentStructure,
          llmIntelligence,
          status: 'completed',
          errorMessage: null,
          analyzedAt: new Date(),
          analysisDurationMs: durationMs,
        });

        this.logger.log(
          `Analysis completed for project ${projectId} in ${durationMs}ms`,
        );

        // Trigger monitor scan
        this.eventEmitter.emit(MONITOR_EVENTS.ANALYSIS_COMPLETED, {
          projectId,
        });
      } finally {
        await cleanup();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Analysis failed for project ${projectId}: ${message}`);

      await this.upsertAnalysis(projectId, {
        status: 'failed',
        errorMessage: message,
      });
    }
  }

  /**
   * Run analysis for a project when userId is not known (e.g. webhook push).
   * Looks up an org member with a GitHub token.
   */
  private async runAnalysisForProject(projectId: string): Promise<void> {
    const project = await this.projectsService.findById(projectId);
    if (!project) {
      this.logger.warn(`Project ${projectId} not found for analysis`);
      return;
    }

    // Find a user in the org who has a GitHub token
    const userId = await this.findUserWithGithubToken(project.orgId);
    if (!userId) {
      this.logger.warn(`No user with GitHub token found for project ${projectId}`);
      await this.upsertAnalysis(projectId, {
        status: 'failed',
        errorMessage: 'GITHUB_TOKEN_EXPIRED',
      });
      return;
    }

    await this.runAnalysis(projectId, userId);
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

  private async upsertAnalysis(
    projectId: string,
    data: Partial<Omit<CodebaseAnalysis, 'id' | 'projectId' | 'createdAt'>>,
  ): Promise<void> {
    const existing = await this.findByProjectId(projectId);

    if (existing) {
      await this.db
        .update(codebaseAnalyses)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(codebaseAnalyses.projectId, projectId));
    } else {
      await this.db.insert(codebaseAnalyses).values({
        projectId,
        status: (data.status as 'pending' | 'analyzing' | 'completed' | 'failed') ?? 'pending',
        ...data,
      });
    }
  }
}
