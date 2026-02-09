import {
  pgTable,
  uuid,
  timestamp,
  pgEnum,
  unique,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { users } from './users';

export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member']);

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: orgRoleEnum('role').notNull().default('owner'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique('org_members_org_user_unique').on(table.orgId, table.userId)],
);

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;
