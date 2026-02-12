import {
  Inject,
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.constants';
import { DrizzleDB } from '../database/database.module';
import {
  monitorScans,
  scanFindings,
  projects,
} from '../database/schema';
import { ProjectsService } from '../projects/projects.service';
import { AnalysisService } from '../analysis/analysis.service';
import { UsersService } from '../users/users.service';
import { MONITOR_EVENTS, SCANNER_IDS } from './monitor.constants';
import {
  ScanContext,
  ScanRequestedPayload,
  FindingData,
} from './monitor.interfaces';
import { CveScanner } from './scanners/cve.scanner';
import { FreshnessScanner } from './scanners/freshness.scanner';
import { SecretsScanner } from './scanners/secrets.scanner';
import { AuthCoverageScanner } from './scanners/auth-coverage.scanner';
import { CodeHealthScanner } from './scanners/code-health.scanner';
import { EnvExposureScanner } from './scanners/env-exposure.scanner';
import { UptimeScanner } from './scanners/uptime.scanner';
import { SslScanner } from './scanners/ssl.scanner';

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private projectsService: ProjectsService,
    private analysisService: AnalysisService,
    private usersService: UsersService,
    private cveScanner: CveScanner,
    private freshnessScanner: FreshnessScanner,
    private secretsScanner: SecretsScanner,
    private authCoverageScanner: AuthCoverageScanner,
    private codeHealthScanner: CodeHealthScanner,
    private envExposureScanner: EnvExposureScanner,
    private uptimeScanner: UptimeScanner,
    private sslScanner: SslScanner,
  ) {}

  @OnEvent(MONITOR_EVENTS.ANALYSIS_COMPLETED)
  async handleAnalysisCompleted(payload: {
    projectId: string;
  }): Promise<void> {
    this.logger.log(
      `Analysis completed for project ${payload.projectId}, auto-triggering scan`,
    );

    // Concurrency guard
    const latestScan = await this.findLatestScan(payload.projectId);
    if (latestScan?.status === 'scanning') {
      this.logger.warn(
        `Scan already running for project ${payload.projectId}, skipping auto-trigger`,
      );
      return;
    }

    await this.runScan(payload.projectId, 'auto');
  }

  @OnEvent(MONITOR_EVENTS.SCAN_REQUESTED)
  async handleScanRequested(payload: ScanRequestedPayload): Promise<void> {
    await this.runScan(payload.projectId, payload.trigger);
  }

  async runLiveCheck(
    projectId: string,
  ): Promise<{ message: string; findings: FindingData[] }> {
    const project = await this.projectsService.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (!project.productionUrl) {
      return { message: 'No production URL configured', findings: [] };
    }

    const context: ScanContext = { project, analysis: null, githubToken: null };
    const allFindings: { scanner: string; findings: FindingData[] }[] = [];

    const liveScanners = [
      { id: SCANNER_IDS.UPTIME, scanner: this.uptimeScanner },
      { id: SCANNER_IDS.SSL, scanner: this.sslScanner },
    ];

    for (const { id, scanner } of liveScanners) {
      try {
        const findings = await scanner.scan(context);
        allFindings.push({ scanner: id, findings });
      } catch (error) {
        this.logger.error(
          `Live check scanner ${id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Persist findings with dedup (use latest scan ID if exists, or null)
    const latestScan = await this.findLatestScan(projectId);
    if (latestScan) {
      await this.persistFindings(projectId, latestScan.id, allFindings);
      await this.updateProjectHealthStatus(projectId);
    }

    const flat = allFindings.flatMap((r) => r.findings);
    return { message: 'Live check completed', findings: flat };
  }

  async requestScan(
    projectId: string,
  ): Promise<{ message: string; scanId: string }> {
    const latestScan = await this.findLatestScan(projectId);
    if (latestScan?.status === 'scanning') {
      throw new ConflictException('Scan already in progress');
    }

    // Create scan record first, then emit event
    const [scan] = await this.db
      .insert(monitorScans)
      .values({
        projectId,
        status: 'scanning',
        trigger: 'manual',
      })
      .returning();

    // Run scan asynchronously
    this.runScan(projectId, 'manual', scan.id).catch((error) => {
      this.logger.error(
        `Background scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    });

    return { message: 'Scan started', scanId: scan.id };
  }

  async findLatestScan(projectId: string) {
    const [scan] = await this.db
      .select()
      .from(monitorScans)
      .where(eq(monitorScans.projectId, projectId))
      .orderBy(sql`${monitorScans.createdAt} DESC`)
      .limit(1);
    return scan ?? null;
  }

  async findScans(projectId: string) {
    return this.db
      .select()
      .from(monitorScans)
      .where(eq(monitorScans.projectId, projectId))
      .orderBy(sql`${monitorScans.createdAt} DESC`)
      .limit(20);
  }

  async findFindings(
    projectId: string,
    filters: { status?: string; severity?: string; scanner?: string },
  ) {
    const conditions = [eq(scanFindings.projectId, projectId)];

    if (filters.status) {
      conditions.push(
        eq(
          scanFindings.status,
          filters.status as 'open' | 'resolved' | 'dismissed',
        ),
      );
    }
    if (filters.severity) {
      conditions.push(
        eq(
          scanFindings.severity,
          filters.severity as
            | 'critical'
            | 'high'
            | 'medium'
            | 'low'
            | 'info',
        ),
      );
    }
    if (filters.scanner) {
      conditions.push(eq(scanFindings.scanner, filters.scanner));
    }

    return this.db
      .select()
      .from(scanFindings)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${scanFindings.scanner}
          WHEN 's7-uptime' THEN 1
          WHEN 's7a-ssl' THEN 2
          ELSE 3
        END`,
        sql`CASE ${scanFindings.severity}
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          WHEN 'info' THEN 5
        END`,
        sql`${scanFindings.lastSeenAt} DESC`,
      );
  }

  async dismissFinding(
    findingId: string,
    projectId: string,
  ) {
    const [finding] = await this.db
      .select()
      .from(scanFindings)
      .where(
        and(
          eq(scanFindings.id, findingId),
          eq(scanFindings.projectId, projectId),
        ),
      );

    if (!finding) {
      throw new NotFoundException('Finding not found');
    }

    const [updated] = await this.db
      .update(scanFindings)
      .set({
        status: 'dismissed',
        resolvedAt: new Date(),
      })
      .where(eq(scanFindings.id, findingId))
      .returning();

    // Update project health status after dismissal
    await this.updateProjectHealthStatus(projectId);

    return updated;
  }

  private async runScan(
    projectId: string,
    trigger: 'manual' | 'auto' | 'scheduled',
    existingScanId?: string,
  ): Promise<void> {
    const startTime = Date.now();

    let scanId = existingScanId;

    // Create scan record if not already created
    if (!scanId) {
      const [scan] = await this.db
        .insert(monitorScans)
        .values({
          projectId,
          status: 'scanning',
          trigger,
        })
        .returning();
      scanId = scan.id;
    }

    try {
      // Get project and analysis data
      const project = await this.projectsService.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const analysis = await this.analysisService.findByProjectId(projectId);

      // Look up a GitHub token for external API calls (CVE scanner)
      const githubToken = await this.findGithubTokenForProject(project.orgId);

      const context: ScanContext = { project, analysis: analysis ?? null, githubToken };

      // Run scanners
      const scannersRun: string[] = [];
      const allFindings: { scanner: string; findings: FindingData[] }[] = [];

      // Static scanners (S1-S6) — require analysis data
      if (analysis?.status === 'completed') {
        const staticScanners = [
          { id: SCANNER_IDS.CVE, scanner: this.cveScanner },
          { id: SCANNER_IDS.FRESHNESS, scanner: this.freshnessScanner },
          { id: SCANNER_IDS.SECRETS, scanner: this.secretsScanner },
          { id: SCANNER_IDS.AUTH_COVERAGE, scanner: this.authCoverageScanner },
          { id: SCANNER_IDS.CODE_HEALTH, scanner: this.codeHealthScanner },
          { id: SCANNER_IDS.ENV_EXPOSURE, scanner: this.envExposureScanner },
        ];

        for (const { id, scanner } of staticScanners) {
          try {
            this.logger.log(`Running scanner ${id} for project ${projectId}`);
            const findings = await scanner.scan(context);
            scannersRun.push(id);
            allFindings.push({ scanner: id, findings });
          } catch (error) {
            this.logger.error(
              `Scanner ${id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            scannersRun.push(id);
          }
        }
      } else {
        this.logger.warn(
          `No completed analysis for project ${projectId}, skipping static scans`,
        );
      }

      // Live scanners (S7, S7a) — require production URL
      if (project.productionUrl) {
        const liveScanners = [
          { id: SCANNER_IDS.UPTIME, scanner: this.uptimeScanner },
          { id: SCANNER_IDS.SSL, scanner: this.sslScanner },
        ];

        for (const { id, scanner } of liveScanners) {
          try {
            this.logger.log(`Running scanner ${id} for project ${projectId}`);
            const findings = await scanner.scan(context);
            scannersRun.push(id);
            allFindings.push({ scanner: id, findings });
          } catch (error) {
            this.logger.error(
              `Scanner ${id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            scannersRun.push(id);
          }
        }
      }

      // Deduplication and persistence
      const { newCount, resolvedCount, totalCount } =
        await this.persistFindings(projectId, scanId, allFindings);

      const durationMs = Date.now() - startTime;

      // Update scan record
      await this.db
        .update(monitorScans)
        .set({
          status: 'completed',
          scannersRun,
          totalFindings: totalCount,
          newFindings: newCount,
          resolvedFindings: resolvedCount,
          durationMs,
          completedAt: new Date(),
        })
        .where(eq(monitorScans.id, scanId));

      // Update project health status
      await this.updateProjectHealthStatus(projectId);

      this.logger.log(
        `Scan completed for project ${projectId} in ${durationMs}ms: ${totalCount} findings (${newCount} new, ${resolvedCount} resolved)`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Scan failed for project ${projectId}: ${message}`);

      await this.db
        .update(monitorScans)
        .set({
          status: 'failed',
          errorMessage: message,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
        })
        .where(eq(monitorScans.id, scanId));
    }
  }

  private async persistFindings(
    projectId: string,
    scanId: string,
    scannerResults: { scanner: string; findings: FindingData[] }[],
  ): Promise<{ newCount: number; resolvedCount: number; totalCount: number }> {
    const seenFingerprints = new Set<string>();
    let newCount = 0;
    let totalCount = 0;

    for (const { scanner, findings } of scannerResults) {
      for (const finding of findings) {
        seenFingerprints.add(finding.fingerprint);
        totalCount++;

        // Check for existing finding with same fingerprint
        const [existing] = await this.db
          .select()
          .from(scanFindings)
          .where(
            and(
              eq(scanFindings.projectId, projectId),
              eq(scanFindings.fingerprint, finding.fingerprint),
            ),
          );

        if (existing) {
          if (existing.status === 'dismissed') {
            // Dismissed findings stay dismissed — don't re-open
            continue;
          }

          // Update lastSeenAt for existing open finding
          await this.db
            .update(scanFindings)
            .set({
              lastSeenAt: new Date(),
              status: 'open',
              resolvedAt: null,
              // Update details with latest data
              severity: finding.severity,
              title: finding.title,
              description: finding.description,
              details: finding.details,
            })
            .where(eq(scanFindings.id, existing.id));
        } else {
          // Insert new finding
          await this.db.insert(scanFindings).values({
            projectId,
            scanId,
            scanner,
            fingerprint: finding.fingerprint,
            severity: finding.severity,
            title: finding.title,
            description: finding.description,
            details: finding.details,
            status: 'open',
          });
          newCount++;
        }
      }
    }

    // Resolve findings not seen in this scan — only for scanners that actually ran
    const scannersRun = scannerResults.map((r) => r.scanner);
    const openFindings = await this.db
      .select({ id: scanFindings.id, fingerprint: scanFindings.fingerprint, scanner: scanFindings.scanner })
      .from(scanFindings)
      .where(
        and(
          eq(scanFindings.projectId, projectId),
          eq(scanFindings.status, 'open'),
          inArray(scanFindings.scanner, scannersRun),
        ),
      );

    const toResolve = openFindings.filter(
      (f) => !seenFingerprints.has(f.fingerprint),
    );

    if (toResolve.length > 0) {
      await this.db
        .update(scanFindings)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
        })
        .where(
          inArray(
            scanFindings.id,
            toResolve.map((f) => f.id),
          ),
        );
    }

    return {
      newCount,
      resolvedCount: toResolve.length,
      totalCount,
    };
  }

  private async updateProjectHealthStatus(projectId: string): Promise<void> {
    // Get worst active finding severity
    const [worst] = await this.db
      .select({ severity: scanFindings.severity })
      .from(scanFindings)
      .where(
        and(
          eq(scanFindings.projectId, projectId),
          eq(scanFindings.status, 'open'),
        ),
      )
      .orderBy(
        sql`CASE ${scanFindings.severity}
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          WHEN 'info' THEN 5
        END`,
      )
      .limit(1);

    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (worst) {
      if (worst.severity === 'critical') {
        healthStatus = 'critical';
      } else if (worst.severity === 'high') {
        healthStatus = 'warning';
      }
    }

    await this.db
      .update(projects)
      .set({ healthStatus, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  }

  private async findGithubTokenForProject(orgId: string): Promise<string | null> {
    const rows = await this.db.execute(
      sql`SELECT om.user_id FROM org_members om
          INNER JOIN github_tokens gt ON gt.user_id = om.user_id
          WHERE om.org_id = ${orgId}
          LIMIT 1`,
    );
    const result = rows.rows?.[0] as { user_id: string } | undefined;
    if (!result) return null;

    return this.usersService.getGithubToken(result.user_id);
  }
}
