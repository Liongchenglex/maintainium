import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { GitHubModule } from './github/github.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProjectsModule } from './projects/projects.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AnalysisModule } from './analysis/analysis.module';
import { MonitorModule } from './monitor/monitor.module';
import { IssuesModule } from './issues/issues.module';
import { PreviewModule } from './preview/preview.module';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    HealthModule,
    GitHubModule,
    OrganizationsModule,
    ProjectsModule,
    WebhooksModule,
    AnalysisModule,
    MonitorModule,
    IssuesModule,
    PreviewModule,
  ],
})
export class AppModule {}
