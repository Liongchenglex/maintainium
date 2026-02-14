import { Module, forwardRef } from '@nestjs/common';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { TriageAgentService } from './services/triage-agent.service';
import { DiagnosisAgentService } from './services/diagnosis-agent.service';
import { EmbeddingService } from './services/embedding.service';
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
  controllers: [IssuesController],
  providers: [IssuesService, TriageAgentService, DiagnosisAgentService, EmbeddingService],
  exports: [IssuesService],
})
export class IssuesModule {}
