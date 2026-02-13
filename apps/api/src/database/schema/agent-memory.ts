import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  customType,
} from 'drizzle-orm/pg-core';
import { projects } from './projects';

/**
 * Custom pgvector type for Drizzle ORM.
 * Stores OpenAI text-embedding-3-small vectors (1536 dimensions).
 * Requires: CREATE EXTENSION IF NOT EXISTS vector;
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector returns '[1,2,3]' string format
    return JSON.parse(value) as number[];
  },
});

export const agentMemoryEmbeddings = pgTable('agent_memory_embeddings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  featureArea: varchar('feature_area', { length: 255 }).notNull(),
  contentType: varchar('content_type', { length: 50 }).notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AgentMemoryEmbedding = typeof agentMemoryEmbeddings.$inferSelect;
export type NewAgentMemoryEmbedding = typeof agentMemoryEmbeddings.$inferInsert;
