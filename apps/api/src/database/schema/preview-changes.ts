import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { projects } from './projects';

export const previewChangeStatusEnum = pgEnum('preview_change_status', [
  'pending',
  'ready',
  'applied',
  'dismissed',
  'failed',
]);

export const previewChanges = pgTable('preview_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  currentUrl: text('current_url').notNull(),
  elementText: text('element_text').notNull(),
  cssSelector: text('css_selector'),
  tagName: text('tag_name').notNull(),
  pageContext: jsonb('page_context'),
  requestedChange: text('requested_change').notNull(),
  status: previewChangeStatusEnum('status').notNull().default('pending'),
  targetFilePath: text('target_file_path'),
  originalContent: text('original_content'),
  modifiedContent: text('modified_content'),
  diff: jsonb('diff'),
  changeSummary: text('change_summary'),
  branchName: text('branch_name'),
  commitSha: text('commit_sha'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PreviewChange = typeof previewChanges.$inferSelect;
export type NewPreviewChange = typeof previewChanges.$inferInsert;
