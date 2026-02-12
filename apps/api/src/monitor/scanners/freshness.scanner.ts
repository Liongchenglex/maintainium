import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

interface NpmPackageInfo {
  'dist-tags': { latest: string };
  deprecated?: string;
}

interface DependencyEntry {
  name: string;
  currentVersion: string;
  isDirect: boolean;
  isFrameworkCritical: boolean;
}

@Injectable()
export class FreshnessScanner {
  private readonly logger = new Logger(FreshnessScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { analysis } = context;
    if (!analysis?.dependencyInventory) {
      this.logger.warn('No dependency inventory available, skipping freshness scan');
      return [];
    }

    const deps = analysis.dependencyInventory as DependencyEntry[];
    if (deps.length === 0) return [];

    const findings: FindingData[] = [];

    for (const dep of deps) {
      try {
        const info = await this.fetchPackageInfo(dep.name);
        if (!info) continue;

        const latestVersion = info['dist-tags'].latest;
        const majorsBehind = this.getMajorVersionDelta(
          dep.currentVersion,
          latestVersion,
        );

        const isDeprecated = !!info.deprecated;

        if (majorsBehind >= 2 || isDeprecated) {
          const fingerprint = createHash('sha256')
            .update(`${SCANNER_IDS.FRESHNESS}:${dep.name}`)
            .digest('hex');

          const severity = isDeprecated
            ? 'high'
            : majorsBehind >= 4
              ? 'high'
              : 'medium';

          const title = isDeprecated
            ? `${dep.name} is deprecated`
            : `${dep.name} is ${majorsBehind} major versions behind`;

          findings.push({
            fingerprint,
            severity,
            title,
            description: isDeprecated
              ? `${dep.name}@${dep.currentVersion} is deprecated. Latest: ${latestVersion}.`
              : `${dep.name}@${dep.currentVersion} is ${majorsBehind} major version(s) behind latest (${latestVersion}).`,
            details: {
              packageName: dep.name,
              installedVersion: dep.currentVersion,
              latestVersion,
              majorsBehind,
              deprecated: isDeprecated,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check freshness for ${dep.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return findings;
  }

  private async fetchPackageInfo(
    packageName: string,
  ): Promise<NpmPackageInfo | null> {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
        {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) return null;

      return (await response.json()) as NpmPackageInfo;
    } catch {
      return null;
    }
  }

  private getMajorVersionDelta(installed: string, latest: string): number {
    const cleanInstalled = installed.replace(/^[^0-9]*/, '');
    const cleanLatest = latest.replace(/^[^0-9]*/, '');

    const installedMajor = parseInt(cleanInstalled.split('.')[0], 10);
    const latestMajor = parseInt(cleanLatest.split('.')[0], 10);

    if (isNaN(installedMajor) || isNaN(latestMajor)) return 0;

    return Math.max(0, latestMajor - installedMajor);
  }
}
