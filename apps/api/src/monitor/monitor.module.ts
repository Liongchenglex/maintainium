import { Module, forwardRef } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { CveScanner } from './scanners/cve.scanner';
import { FreshnessScanner } from './scanners/freshness.scanner';
import { SecretsScanner } from './scanners/secrets.scanner';
import { AuthCoverageScanner } from './scanners/auth-coverage.scanner';
import { CodeHealthScanner } from './scanners/code-health.scanner';
import { EnvExposureScanner } from './scanners/env-exposure.scanner';
import { UptimeScanner } from './scanners/uptime.scanner';
import { SslScanner } from './scanners/ssl.scanner';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AnalysisModule } from '../analysis/analysis.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
    forwardRef(() => AnalysisModule),
  ],
  controllers: [MonitorController],
  providers: [
    MonitorService,
    CveScanner,
    FreshnessScanner,
    SecretsScanner,
    AuthCoverageScanner,
    CodeHealthScanner,
    EnvExposureScanner,
    UptimeScanner,
    SslScanner,
  ],
  exports: [MonitorService],
})
export class MonitorModule {}
