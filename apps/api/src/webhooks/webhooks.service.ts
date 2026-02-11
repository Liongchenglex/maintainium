import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHmac, timingSafeEqual } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { projects } from '../database/schema';
import { EncryptionService } from '../common/encryption.service';
import { ANALYSIS_EVENTS } from '../analysis/analysis.constants';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private encryption: EncryptionService,
    private eventEmitter: EventEmitter2,
  ) {}

  async verifyAndProcess(
    signature: string,
    event: string,
    rawBody: Buffer,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const repoId = (payload.repository as Record<string, unknown>)?.id as number;
    if (!repoId) {
      this.logger.warn('Webhook payload missing repository.id');
      return false;
    }

    // Look up project by GitHub repo ID
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.githubRepoId, repoId));

    if (!project) {
      this.logger.warn(`No project found for GitHub repo ${repoId}`);
      return false;
    }

    if (!project.webhookSecret || !project.webhookSecretIv || !project.webhookSecretTag) {
      this.logger.warn(`Project ${project.id} has no webhook secret`);
      return false;
    }

    // Decrypt webhook secret
    const secret = this.encryption.decrypt(
      project.webhookSecret,
      project.webhookSecretIv,
      project.webhookSecretTag,
    );

    // Verify HMAC
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (sigBuffer.length !== expectedBuffer.length) {
      this.logger.warn(`Invalid webhook signature for project ${project.id} (length mismatch: got ${sigBuffer.length}, expected ${expectedBuffer.length})`);
      return false;
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.logger.warn(`Invalid webhook signature for project ${project.id}`);
      return false;
    }

    // Process event
    if (event === 'ping') {
      this.logger.log(`Webhook ping received for project ${project.id}`);
      return true;
    }

    if (event === 'push') {
      await this.db
        .update(projects)
        .set({ updatedAt: sql`now()` })
        .where(eq(projects.id, project.id));

      // Check if push is to the default branch
      const ref = payload.ref as string | undefined;
      const defaultBranch = project.githubDefaultBranch;
      if (ref && defaultBranch && ref === `refs/heads/${defaultBranch}`) {
        this.logger.log(`Push to default branch detected for project ${project.id}, triggering re-analysis`);
        this.eventEmitter.emit(ANALYSIS_EVENTS.PROJECT_PUSHED, {
          projectId: project.id,
        });
      } else {
        this.logger.log(`Push to non-default branch (${ref}), skipping re-analysis`);
      }

      this.logger.log(`Push event processed for project ${project.id}`);
      return true;
    }

    this.logger.log(`Unhandled webhook event: ${event}`);
    return true;
  }
}
