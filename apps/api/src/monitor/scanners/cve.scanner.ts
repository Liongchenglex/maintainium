import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

interface Advisory {
  ghsa_id: string;
  cve_id: string | null;
  severity: string;
  summary: string;
  html_url: string;
  vulnerabilities: {
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    first_patched_version: { identifier: string } | null;
  }[];
}

interface DependencyEntry {
  name: string;
  currentVersion: string;
  isDirect: boolean;
  isFrameworkCritical: boolean;
}

// In-memory cache: package name → { advisories, fetchedAt }
const advisoryCache = new Map<
  string,
  { advisories: Advisory[]; fetchedAt: number }
>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const DELAY_BETWEEN_CALLS_MS = 150;

@Injectable()
export class CveScanner {
  private readonly logger = new Logger(CveScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { analysis } = context;
    if (!analysis?.dependencyInventory) {
      this.logger.warn('No dependency inventory available, skipping CVE scan');
      return [];
    }

    const deps = analysis.dependencyInventory as DependencyEntry[];
    if (deps.length === 0) return [];

    // Only check direct and framework-critical deps to minimize API calls
    const relevant = deps.filter((d) => d.isDirect || d.isFrameworkCritical);
    if (relevant.length === 0) return [];

    // Sort: framework-critical first, then direct
    const sorted = [...relevant].sort((a, b) => {
      if (a.isFrameworkCritical !== b.isFrameworkCritical) {
        return a.isFrameworkCritical ? -1 : 1;
      }
      return 0;
    });
    // Cap at 50 packages — realistic for direct deps
    const toCheck = sorted.slice(0, 50);

    this.logger.log(
      `CVE scan: checking ${toCheck.length} direct/critical deps (${deps.length} total in inventory)`,
    );

    const findings: FindingData[] = [];
    let apiCalls = 0;
    let cacheHits = 0;

    for (const dep of toCheck) {
      try {
        // Check cache first
        const cached = advisoryCache.get(dep.name);
        let advisories: Advisory[];

        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          advisories = cached.advisories;
          cacheHits++;
        } else {
          // Rate-limit: delay between API calls
          if (apiCalls > 0) {
            await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
          }

          advisories = await this.fetchAdvisories(dep.name, context.githubToken);
          advisoryCache.set(dep.name, {
            advisories,
            fetchedAt: Date.now(),
          });
          apiCalls++;
        }

        for (const advisory of advisories) {
          const vuln = advisory.vulnerabilities.find(
            (v) => v.package.name === dep.name && v.package.ecosystem === 'npm',
          );
          if (!vuln) continue;

          if (!this.isVersionAffected(dep.currentVersion, vuln.vulnerable_version_range)) {
            continue;
          }

          const severity = this.mapSeverity(advisory.severity);
          const advisoryId = advisory.cve_id || advisory.ghsa_id;
          const fingerprint = createHash('sha256')
            .update(`${SCANNER_IDS.CVE}:${dep.name}:${advisoryId}`)
            .digest('hex');

          findings.push({
            fingerprint,
            severity,
            title: `${advisoryId} in ${dep.name}`,
            description: advisory.summary,
            details: {
              packageName: dep.name,
              installedVersion: dep.currentVersion,
              advisoryId,
              advisoryUrl: advisory.html_url,
              patchedVersion: vuln.first_patched_version?.identifier ?? null,
              vulnerableRange: vuln.vulnerable_version_range,
            },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check CVEs for ${dep.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log(
      `CVE scan complete: ${apiCalls} API calls, ${cacheHits} cache hits, ${findings.length} findings`,
    );

    return findings;
  }

  private async fetchAdvisories(
    packageName: string,
    githubToken: string | null,
    retries = 3,
  ): Promise<Advisory[]> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
        };
        if (githubToken) {
          headers['Authorization'] = `Bearer ${githubToken}`;
        }

        const response = await fetch(
          `https://api.github.com/advisories?ecosystem=npm&package=${encodeURIComponent(packageName)}&per_page=20`,
          {
            headers,
            signal: AbortSignal.timeout(10000),
          },
        );

        if (response.status === 429) {
          if (attempt < retries) {
            const retryAfter = response.headers.get('retry-after');
            const backoff = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : Math.pow(2, attempt) * 1000;
            this.logger.warn(
              `Rate limited on ${packageName}, retrying in ${backoff}ms (attempt ${attempt}/${retries})`,
            );
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw new Error('GitHub Advisory API rate limited');
        }

        if (!response.ok) {
          throw new Error(`GitHub Advisory API returned ${response.status}`);
        }

        return (await response.json()) as Advisory[];
      } catch (error) {
        if (attempt === retries) throw error;
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    return [];
  }

  private isVersionAffected(installed: string, range: string): boolean {
    // Simple heuristic: if the package has an advisory for its ecosystem,
    // and we can't conclusively determine it's NOT affected, flag it.
    // A full semver range check would require a semver library.
    const cleanVersion = installed.replace(/^[^0-9]*/, '');
    if (!cleanVersion) return false;

    // Conservative: flag if any advisory exists for this package.
    return range.length > 0;
  }

  private mapSeverity(
    ghSeverity: string,
  ): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    switch (ghSeverity.toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'info';
    }
  }
}
