import {
  pgTable,
  uuid,
  varchar,
  text,
  real,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const issueStatusEnum = pgEnum('issue_status', [
  'new',
  'triaged',
  'needs-review',
  'diagnosed',
  'diagnosis-failed',
  'resolved',
]);

export const issuePriorityEnum = pgEnum('issue_priority', [
  'critical',
  'high',
  'medium',
  'low',
]);

export const reportedIssues = pgTable('reported_issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  reporterEmail: varchar('reporter_email', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  description: text('description').notNull(),
  status: issueStatusEnum('status').notNull().default('new'),
  priority: issuePriorityEnum('priority'),
  assignedArea: varchar('assigned_area', { length: 255 }),
  triageNotes: text('triage_notes'),
  triageConfidence: real('triage_confidence'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ReportedIssue = typeof reportedIssues.$inferSelect;
export type NewReportedIssue = typeof reportedIssues.$inferInsert;
