import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const githubTokens = pgTable('github_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  accessTokenIv: text('access_token_iv').notNull(),
  accessTokenTag: text('access_token_tag').notNull(),
  githubUsername: varchar('github_username', { length: 255 }),
  scopes: text('scopes'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type GithubToken = typeof githubTokens.$inferSelect;
export type NewGithubToken = typeof githubTokens.$inferInsert;
