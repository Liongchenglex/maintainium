import { Module, forwardRef } from '@nestjs/common';
import { GitHubController } from './github.controller';
import { GitHubService } from './github.service';
import { GitHubOAuthService } from './github-oauth.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => UsersModule), forwardRef(() => AuthModule)],
  controllers: [GitHubController],
  providers: [GitHubService, GitHubOAuthService],
  exports: [GitHubService, GitHubOAuthService],
})
export class GitHubModule {}
