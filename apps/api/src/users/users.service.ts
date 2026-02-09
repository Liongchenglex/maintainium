import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import { users, User, githubTokens } from '../database/schema';
import { DecodedFirebaseToken } from '../auth/auth.interfaces';
import { EncryptionService } from '../common/encryption.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private encryption: EncryptionService,
  ) {}

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

  async storeGithubToken(userId: string, accessToken: string): Promise<void> {
    const { encrypted, iv, tag } = this.encryption.encrypt(accessToken);

    await this.db
      .insert(githubTokens)
      .values({
        userId,
        accessTokenEncrypted: encrypted,
        accessTokenIv: iv,
        accessTokenTag: tag,
      })
      .onConflictDoUpdate({
        target: githubTokens.userId,
        set: {
          accessTokenEncrypted: encrypted,
          accessTokenIv: iv,
          accessTokenTag: tag,
          updatedAt: sql`now()`,
        },
      });
  }

  async getGithubToken(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(githubTokens)
      .where(eq(githubTokens.userId, userId));

    if (!row) return null;

    return this.encryption.decrypt(
      row.accessTokenEncrypted,
      row.accessTokenIv,
      row.accessTokenTag,
    );
  }

  async hasGithubToken(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: githubTokens.id })
      .from(githubTokens)
      .where(eq(githubTokens.userId, userId));

    return !!row;
  }

  async getGithubUsername(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ githubUsername: githubTokens.githubUsername })
      .from(githubTokens)
      .where(eq(githubTokens.userId, userId));

    return row?.githubUsername ?? null;
  }

  async updateGithubUsername(
    userId: string,
    githubUsername: string,
  ): Promise<void> {
    await this.db
      .update(githubTokens)
      .set({ githubUsername, updatedAt: sql`now()` })
      .where(eq(githubTokens.userId, userId));
  }
}
