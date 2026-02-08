import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { users, User } from '../database/schema';
import { DecodedFirebaseToken } from '../auth/auth.interfaces';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async upsertFromFirebase(decoded: DecodedFirebaseToken): Promise<User> {
    const provider =
      decoded.firebase.sign_in_provider === 'github.com' ? 'github' : 'email';
    const email = decoded.email ?? `${decoded.uid}@noreply.github.com`;

    const [user] = await this.db
      .insert(users)
      .values({
        firebaseUid: decoded.uid,
        email,
        displayName: decoded.name ?? null,
        avatarUrl: decoded.picture ?? null,
        authProvider: provider,
        emailVerified: decoded.email_verified ?? false,
        lastLoginAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.firebaseUid,
        set: {
          email,
          displayName: decoded.name ?? null,
          avatarUrl: decoded.picture ?? null,
          authProvider: provider,
          emailVerified: decoded.email_verified ?? false,
          lastLoginAt: new Date(),
          updatedAt: sql`now()`,
        },
      })
      .returning();

    return user;
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, firebaseUid));
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user;
  }
}
