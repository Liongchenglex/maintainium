import {
  Inject,
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { projects, Project, codebaseAnalyses } from '../database/schema';
import { User } from '../database/schema';
import { UsersService } from '../users/users.service';
import { GitHubService } from '../github/github.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { EncryptionService } from '../common/encryption.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ANALYSIS_EVENTS } from '../analysis/analysis.constants';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);
  private readonly webhookBaseUrl: string;

  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private usersService: UsersService,
    private githubService: GitHubService,
    private organizationsService: OrganizationsService,
    private encryption: EncryptionService,
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    this.webhookBaseUrl = this.configService.get<string>(
      'WEBHOOK_BASE_URL',
      'http://localhost:4000',
    );
  }

  async createFromGitHub(user: User, dto: CreateProjectDto): Promise<Project> {
    const token = await this.usersService.getGithubToken(user.id);
    if (!token) {
      throw new ForbiddenException('GitHub account not connected');
    }

    // Fetch repo details from GitHub (validates access)
    const repo = await this.githubService.getRepository(
      token,
      dto.owner,
      dto.repo,
    );

    // Ensure default org
    const org = await this.organizationsService.ensureDefaultOrg(
      user.id,
      user.displayName,
    );

    // Check for duplicate
    const [existing] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.orgId, org.id),
          eq(projects.githubRepoId, repo.id),
        ),
      );

    if (existing) {
      throw new ConflictException('This repository is already connected');
    }

    const slug = repo.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Generate webhook secret
    const webhookSecretPlain = randomBytes(32).toString('hex');
    const { encrypted, iv, tag } = this.encryption.encrypt(webhookSecretPlain);

    // Insert project
    const [project] = await this.db
      .insert(projects)
      .values({
        orgId: org.id,
        name: repo.name,
        slug,
        sourceType: 'github',
        sourceUrl: repo.html_url,
        githubRepoId: repo.id,
        githubOwner: repo.owner.login,
        githubRepoName: repo.name,
        githubDefaultBranch: repo.default_branch,
        visibility: repo.private ? 'private' : 'public',
        webhookSecret: encrypted,
        webhookSecretIv: iv,
        webhookSecretTag: tag,
      })
      .returning();

    // Register webhook (non-fatal)
    try {
      const webhook = await this.githubService.createWebhook(
        token,
        dto.owner,
        dto.repo,
        `${this.webhookBaseUrl}/webhooks/github`,
        webhookSecretPlain,
      );

      await this.db
        .update(projects)
        .set({ webhookId: webhook.id, updatedAt: sql`now()` })
        .where(eq(projects.id, project.id));

      project.webhookId = webhook.id;
    } catch (error) {
      this.logger.warn(
        `Failed to register webhook for project ${project.id}: ${error}`,
      );
    }

    // Trigger codebase analysis
    this.eventEmitter.emit(ANALYSIS_EVENTS.PROJECT_CREATED, {
      projectId: project.id,
      userId: user.id,
    });

    return project;
  }

  async listByUser(userId: string) {
    const orgs = await this.organizationsService.findByUserId(userId);
    if (orgs.length === 0) return [];

    const orgIds = orgs.map((o) => o.id);
    const rows = await this.db
      .select({
        project: projects,
        analysisStatus: codebaseAnalyses.status,
      })
      .from(projects)
      .leftJoin(codebaseAnalyses, eq(projects.id, codebaseAnalyses.projectId))
      .where(
        and(
          sql`${projects.orgId} IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`,
          eq(projects.isActive, true),
        ),
      )
      .orderBy(sql`${projects.updatedAt} DESC`);

    return rows.map((row) => ({
      ...row.project,
      analysisStatus: row.analysisStatus ?? null,
    }));
  }

  async findById(id: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    return project;
  }

  async findByIdWithAuth(
    id: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.findById(id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isMember = await this.organizationsService.isUserMember(
      project.orgId,
      userId,
    );
    if (!isMember) {
      throw new ForbiddenException('Access denied');
    }

    return project;
  }

  async getConnectedRepoIds(userId: string): Promise<number[]> {
    const userProjects = await this.listByUser(userId);
    return userProjects
      .filter((p) => p.githubRepoId !== null)
      .map((p) => p.githubRepoId!);
  }
}
