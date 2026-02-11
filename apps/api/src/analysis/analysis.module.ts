import { Module, forwardRef } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { RepoDownloaderService } from './services/repo-downloader.service';
import { LlmService } from './services/llm.service';
import { ProjectMetadataAnalyzer } from './analyzers/project-metadata.analyzer';
import { DependencyInventoryAnalyzer } from './analyzers/dependency-inventory.analyzer';
import { FileRegistryAnalyzer } from './analyzers/file-registry.analyzer';
import { DependencyGraphAnalyzer } from './analyzers/dependency-graph.analyzer';
import { ApiSurfaceAnalyzer } from './analyzers/api-surface.analyzer';
import { DataModelAnalyzer } from './analyzers/data-model.analyzer';
import { PatternsAnalyzer } from './analyzers/patterns.analyzer';
import { SecurityAnalyzer } from './analyzers/security.analyzer';
import { ContentStructureAnalyzer } from './analyzers/content-structure.analyzer';
import { LlmIntelligenceAnalyzer } from './analyzers/llm-intelligence.analyzer';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    RepoDownloaderService,
    LlmService,
    ProjectMetadataAnalyzer,
    DependencyInventoryAnalyzer,
    FileRegistryAnalyzer,
    DependencyGraphAnalyzer,
    ApiSurfaceAnalyzer,
    DataModelAnalyzer,
    PatternsAnalyzer,
    SecurityAnalyzer,
    ContentStructureAnalyzer,
    LlmIntelligenceAnalyzer,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
