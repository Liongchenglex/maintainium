import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { reportedIssues } from './reported-issues';

export const recommendationTypeEnum = pgEnum('recommendation_type', [
  'code-fix',
  'user-education',
  'needs-clarification',
  'escalation',
]);

export const issueDiagnoses = pgTable('issue_diagnoses', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: uuid('issue_id')
    .notNull()
    .references(() => reportedIssues.id),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  recommendationType: recommendationTypeEnum('recommendation_type').notNull(),
  summary: text('summary').notNull(),
  rootCause: text('root_cause').notNull(),
  complicationScore: integer('complication_score').notNull(),
  proposedChanges: jsonb('proposed_changes'),
  educationContent: text('education_content'),
  clarificationQuestions: jsonb('clarification_questions'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type IssueDiagnosis = typeof issueDiagnoses.$inferSelect;
export type NewIssueDiagnosis = typeof issueDiagnoses.$inferInsert;
