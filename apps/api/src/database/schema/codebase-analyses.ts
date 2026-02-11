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

export const analysisStatusEnum = pgEnum('analysis_status', [
  'pending',
  'analyzing',
  'completed',
  'failed',
]);

export const codebaseAnalyses = pgTable('codebase_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id)
    .unique(),
  status: analysisStatusEnum('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  projectMetadata: jsonb('project_metadata'),
  fileRegistry: jsonb('file_registry'),
  dependencyGraph: jsonb('dependency_graph'),
  dependencyInventory: jsonb('dependency_inventory'),
  apiSurface: jsonb('api_surface'),
  dataModel: jsonb('data_model'),
  patterns: jsonb('patterns'),
  securityMetadata: jsonb('security_metadata'),
  contentStructure: jsonb('content_structure'),
  llmIntelligence: jsonb('llm_intelligence'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
  analysisDurationMs: integer('analysis_duration_ms'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CodebaseAnalysis = typeof codebaseAnalyses.$inferSelect;
export type NewCodebaseAnalysis = typeof codebaseAnalyses.$inferInsert;
