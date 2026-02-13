import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { eq, and, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import {
  reportedIssues,
  issueDiagnoses,
} from '../database/schema';
import { ISSUES_EVENTS } from './issues.constants';
import { CreateIssueDto } from './dto/create-issue.dto';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private eventEmitter: EventEmitter2,
  ) {}

  async createIssue(projectId: string, dto: CreateIssueDto) {
    const [issue] = await this.db
      .insert(reportedIssues)
      .values({
        projectId,
        reporterEmail: dto.reporterEmail,
        subject: dto.subject,
        description: dto.description,
        status: 'new',
      })
      .returning();

    this.logger.log(`Issue created: ${issue.id} for project ${projectId}`);

    // Fire-and-forget: trigger triage pipeline
    this.eventEmitter.emit(ISSUES_EVENTS.ISSUE_RECEIVED, {
      issueId: issue.id,
      projectId,
    });

    return issue;
  }

  async findByProjectId(
    projectId: string,
    filters: { status?: string; priority?: string; area?: string },
  ) {
    const conditions = [eq(reportedIssues.projectId, projectId)];

    if (filters.status) {
      conditions.push(
        eq(
          reportedIssues.status,
          filters.status as 'new' | 'triaged' | 'needs-review' | 'diagnosed' | 'diagnosis-failed' | 'resolved',
        ),
      );
    }
    if (filters.priority) {
      conditions.push(
        eq(
          reportedIssues.priority,
          filters.priority as 'critical' | 'high' | 'medium' | 'low',
        ),
      );
    }
    if (filters.area) {
      conditions.push(eq(reportedIssues.assignedArea, filters.area));
    }

    return this.db
      .select()
      .from(reportedIssues)
      .where(and(...conditions))
      .orderBy(sql`${reportedIssues.createdAt} DESC`);
  }

  async findById(issueId: string, projectId: string) {
    const [issue] = await this.db
      .select()
      .from(reportedIssues)
      .where(
        and(
          eq(reportedIssues.id, issueId),
          eq(reportedIssues.projectId, projectId),
        ),
      );

    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    return issue;
  }

  async findIssueWithDiagnosis(issueId: string, projectId: string) {
    const issue = await this.findById(issueId, projectId);

    // Get the active (non-archived) diagnosis
    const [diagnosis] = await this.db
      .select()
      .from(issueDiagnoses)
      .where(
        and(
          eq(issueDiagnoses.issueId, issueId),
          eq(issueDiagnoses.isArchived, false),
        ),
      )
      .orderBy(sql`${issueDiagnoses.createdAt} DESC`)
      .limit(1);

    return { ...issue, diagnosis: diagnosis ?? null };
  }

  async updateIssue(
    issueId: string,
    data: Partial<{
      status: 'new' | 'triaged' | 'needs-review' | 'diagnosed' | 'diagnosis-failed' | 'resolved';
      priority: 'critical' | 'high' | 'medium' | 'low' | null;
      assignedArea: string | null;
      triageNotes: string | null;
      triageConfidence: number | null;
    }>,
  ) {
    const [updated] = await this.db
      .update(reportedIssues)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reportedIssues.id, issueId))
      .returning();

    return updated;
  }

  async resolveIssue(issueId: string, projectId: string) {
    const issue = await this.findById(issueId, projectId);

    const [updated] = await this.db
      .update(reportedIssues)
      .set({ status: 'resolved', updatedAt: new Date() })
      .where(eq(reportedIssues.id, issue.id))
      .returning();

    this.logger.log(`Issue resolved: ${issueId}`);
    return updated;
  }

  async reassignIssue(issueId: string, projectId: string, assignedArea: string) {
    const issue = await this.findById(issueId, projectId);

    // Archive existing diagnoses
    await this.db
      .update(issueDiagnoses)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(
          eq(issueDiagnoses.issueId, issue.id),
          eq(issueDiagnoses.isArchived, false),
        ),
      );

    // Update issue with new area and reset to triaged
    const [updated] = await this.db
      .update(reportedIssues)
      .set({
        assignedArea,
        status: 'triaged',
        updatedAt: new Date(),
      })
      .where(eq(reportedIssues.id, issue.id))
      .returning();

    this.logger.log(`Issue reassigned: ${issueId} to area ${assignedArea}`);

    // Re-trigger diagnosis
    this.eventEmitter.emit(ISSUES_EVENTS.ISSUE_TRIAGED, {
      issueId: issue.id,
      projectId,
      assignedArea,
    });

    return updated;
  }
}
