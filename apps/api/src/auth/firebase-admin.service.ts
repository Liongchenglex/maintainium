import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { DecodedFirebaseToken } from './auth.interfaces';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private app!: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
          clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
          privateKey: this.configService
            .get<string>('FIREBASE_PRIVATE_KEY')
            ?.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      this.app = admin.apps[0]!;
    }
  }

  async verifyIdToken(token: string): Promise<DecodedFirebaseToken> {
    const decoded = await this.app.auth().verifyIdToken(token);
    return decoded as unknown as DecodedFirebaseToken;
  }
}
