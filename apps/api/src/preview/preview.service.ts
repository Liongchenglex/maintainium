import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { projects, previewChanges } from '../database/schema';
import { CreatePreviewChangeDto } from './dto/create-preview-change.dto';

@Injectable()
export class PreviewService {
  private readonly logger = new Logger(PreviewService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async setupPreview(projectId: string, previewUrl: string) {
    const apiKey = randomBytes(32).toString('hex');

    const [updated] = await this.db
      .update(projects)
      .set({
        previewUrl,
        previewApiKey: apiKey,
        updatedAt: sql`now()`,
      })
      .where(eq(projects.id, projectId))
      .returning();

    this.logger.log(`Preview setup for project ${projectId}`);
    return { previewUrl: updated.previewUrl, previewApiKey: updated.previewApiKey };
  }

  async regenerateApiKey(projectId: string) {
    const apiKey = randomBytes(32).toString('hex');

    const [updated] = await this.db
      .update(projects)
      .set({
        previewApiKey: apiKey,
        updatedAt: sql`now()`,
      })
      .where(eq(projects.id, projectId))
      .returning();

    this.logger.log(`Preview API key regenerated for project ${projectId}`);
    return { previewApiKey: updated.previewApiKey };
  }

  async createChange(projectId: string, dto: CreatePreviewChangeDto) {
    const [change] = await this.db
      .insert(previewChanges)
      .values({
        projectId,
        currentUrl: dto.currentUrl,
        elementText: dto.elementText,
        cssSelector: dto.cssSelector ?? null,
        tagName: dto.tagName,
        pageContext:
          dto.pageTitle || dto.nearestHeading || dto.parentContext || dto.outerHtml
            ? {
                pageTitle: dto.pageTitle,
                nearestHeading: dto.nearestHeading,
                parentContext: dto.parentContext,
                outerHtml: dto.outerHtml,
              }
            : null,
        requestedChange: dto.requestedChange,
        status: 'pending',
      })
      .returning();

    this.logger.log(`Preview change created: ${change.id} for project ${projectId}`);
    return change;
  }

  async findByProjectId(projectId: string) {
    return this.db
      .select()
      .from(previewChanges)
      .where(eq(previewChanges.projectId, projectId))
      .orderBy(sql`${previewChanges.createdAt} DESC`);
  }

  async findById(changeId: string, projectId: string) {
    const [change] = await this.db
      .select()
      .from(previewChanges)
      .where(
        and(
          eq(previewChanges.id, changeId),
          eq(previewChanges.projectId, projectId),
        ),
      );

    if (!change) {
      throw new NotFoundException('Preview change not found');
    }

    return change;
  }

  async updateChange(
    changeId: string,
    data: Partial<{
      status: 'pending' | 'ready' | 'applied' | 'dismissed' | 'failed';
      targetFilePath: string | null;
      originalContent: string | null;
      modifiedContent: string | null;
      diff: unknown;
      changeSummary: string | null;
      branchName: string | null;
      commitSha: string | null;
      prUrl: string | null;
      prNumber: number | null;
      errorMessage: string | null;
    }>,
  ) {
    const [updated] = await this.db
      .update(previewChanges)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(previewChanges.id, changeId))
      .returning();

    return updated;
  }

  async dismissChange(changeId: string, projectId: string) {
    const change = await this.findById(changeId, projectId);

    const [updated] = await this.db
      .update(previewChanges)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(eq(previewChanges.id, change.id))
      .returning();

    this.logger.log(`Preview change dismissed: ${changeId}`);
    return updated;
  }
}
