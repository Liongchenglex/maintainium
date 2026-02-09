import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { EncryptionService } from '../common/encryption.service';

interface OAuthState {
  userId: string;
  nonce: string;
  exp: number;
}

@Injectable()
export class GitHubOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(
    private configService: ConfigService,
    private encryption: EncryptionService,
  ) {
    this.clientId = this.configService.get<string>('GITHUB_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>(
      'GITHUB_CLIENT_SECRET',
      '',
    );
    const apiBaseUrl = this.configService.get<string>(
      'WEBHOOK_BASE_URL',
      'http://localhost:4000',
    );
    this.callbackUrl = `${apiBaseUrl}/github/oauth/callback`;
  }

  generateAuthUrl(userId: string): string {
    const state = this.encodeState(userId);
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'repo',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  encodeState(userId: string): string {
    const payload: OAuthState = {
      userId,
      nonce: randomUUID(),
      exp: Date.now() + 10 * 60 * 1000, // 10 minutes
    };
    const { encrypted, iv, tag } = this.encryption.encrypt(
      JSON.stringify(payload),
    );
    return Buffer.from(JSON.stringify({ encrypted, iv, tag })).toString(
      'base64url',
    );
  }

  decodeState(state: string): OAuthState {
    const { encrypted, iv, tag } = JSON.parse(
      Buffer.from(state, 'base64url').toString('utf8'),
    );
    const payload: OAuthState = JSON.parse(
      this.encryption.decrypt(encrypted, iv, tag),
    );

    if (Date.now() > payload.exp) {
      throw new Error('OAuth state expired');
    }

    return payload;
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.callbackUrl,
        }),
      },
    );

    const body = (await response.json()) as Record<string, string>;

    if (body.error) {
      throw new Error(
        `GitHub OAuth error: ${body.error_description || body.error}`,
      );
    }

    return body.access_token;
  }
}
