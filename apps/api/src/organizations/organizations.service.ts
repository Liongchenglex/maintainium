import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import {
  organizations,
  Organization,
  orgMembers,
} from '../database/schema';

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async findByUserId(userId: string): Promise<Organization[]> {
    const rows = await this.db
      .select({ org: organizations })
      .from(organizations)
      .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, userId));

    return rows.map((r) => r.org);
  }

  async ensureDefaultOrg(
    userId: string,
    displayName: string | null,
  ): Promise<Organization> {
    const existing = await this.findByUserId(userId);
    if (existing.length > 0) {
      return existing[0];
    }

    const orgName = displayName ? `${displayName}'s Workspace` : 'My Workspace';
    const slug = `${userId.slice(0, 8)}-workspace`;

    return this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: orgName, slug })
        .onConflictDoUpdate({
          target: organizations.slug,
          set: { updatedAt: sql`now()` },
        })
        .returning();

      await tx
        .insert(orgMembers)
        .values({ orgId: org.id, userId, role: 'owner' })
        .onConflictDoUpdate({
          target: [orgMembers.orgId, orgMembers.userId],
          set: { role: 'owner' },
        });

      return org;
    });
  }

  async isUserMember(orgId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(
        sql`${orgMembers.orgId} = ${orgId} AND ${orgMembers.userId} = ${userId}`,
      );
    return !!row;
  }
}
