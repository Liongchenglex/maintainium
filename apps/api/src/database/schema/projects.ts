import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  unique,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const sourceTypeEnum = pgEnum('source_type', ['github']);

export const projectVisibilityEnum = pgEnum('project_visibility', [
  'public',
  'private',
]);

export const healthStatusEnum = pgEnum('health_status', [
  'unknown',
  'healthy',
  'warning',
  'critical',
]);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    sourceType: sourceTypeEnum('source_type').notNull().default('github'),
    sourceUrl: text('source_url'),
    githubRepoId: integer('github_repo_id'),
    githubOwner: varchar('github_owner', { length: 255 }),
    githubRepoName: varchar('github_repo_name', { length: 255 }),
    githubDefaultBranch: varchar('github_default_branch', { length: 255 }),
    visibility: projectVisibilityEnum('visibility')
      .notNull()
      .default('private'),
    webhookId: integer('webhook_id'),
    webhookSecret: text('webhook_secret'),
    webhookSecretIv: text('webhook_secret_iv'),
    webhookSecretTag: text('webhook_secret_tag'),
    productionUrl: text('production_url'),
    healthStatus: healthStatusEnum('health_status')
      .notNull()
      .default('unknown'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('projects_org_github_repo_unique').on(table.orgId, table.githubRepoId),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
