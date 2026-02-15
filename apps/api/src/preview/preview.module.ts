import { Module, forwardRef } from '@nestjs/common';
import { PreviewController } from './preview.controller';
import { OverlayController } from './overlay.controller';
import { PreviewService } from './preview.service';
import { PreviewAgentService } from './preview-agent.service';
import { PreviewApiKeyGuard } from './preview-api-key.guard';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { GitHubModule } from '../github/github.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
    forwardRef(() => AnalysisModule),
    forwardRef(() => GitHubModule),
  ],
  controllers: [PreviewController, OverlayController],
  providers: [PreviewService, PreviewAgentService, PreviewApiKeyGuard],
  exports: [PreviewService],
})
export class PreviewModule {}
