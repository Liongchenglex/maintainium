import { Module } from '@nestjs/common';
import { FirebaseAdminService } from './firebase-admin.service';
import { AuthGuard } from './auth.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [FirebaseAdminService, AuthGuard],
  exports: [FirebaseAdminService, AuthGuard],
})
export class AuthModule {}
