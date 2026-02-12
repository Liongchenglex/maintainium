import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

interface ProjectMetadata {
  envVariables: string[];
}

interface FileRegistryEntry {
  path: string;
  category: string;
}

const SENSITIVE_PATTERNS = [
  /_SECRET$/i,
  /_KEY$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /^DATABASE_URL$/i,
  /^PRIVATE_KEY$/i,
  /^DB_PASSWORD$/i,
  /^DB_HOST$/i,
  /^REDIS_URL$/i,
  /^MONGO_URI$/i,
  /^API_SECRET$/i,
];

const CLIENT_CATEGORIES = ['component', 'page'];

@Injectable()
export class EnvExposureScanner {
  private readonly logger = new Logger(EnvExposureScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { analysis } = context;
    if (!analysis?.projectMetadata || !analysis?.fileRegistry) {
      this.logger.warn('No project metadata or file registry, skipping env exposure scan');
      return [];
    }

    const metadata = analysis.projectMetadata as ProjectMetadata;
    const fileRegistry = analysis.fileRegistry as FileRegistryEntry[];
    const envVars = metadata.envVariables || [];
    const findings: FindingData[] = [];

    const sensitiveVars = envVars.filter((v) =>
      SENSITIVE_PATTERNS.some((p) => p.test(v)),
    );

    const clientFiles = fileRegistry.filter((f) =>
      CLIENT_CATEGORIES.includes(f.category),
    );

    for (const varName of sensitiveVars) {
      // Check if this variable appears in client-side file paths
      // (We flag any sensitive env var as a potential concern, with higher severity
      // if it might appear in client-side code based on naming conventions)
      const isClientExposed = varName.startsWith('NEXT_PUBLIC_') ||
        varName.startsWith('REACT_APP_') ||
        varName.startsWith('VITE_');

      if (isClientExposed) {
        const fingerprint = createHash('sha256')
          .update(`${SCANNER_IDS.ENV_EXPOSURE}:client:${varName}`)
          .digest('hex');

        findings.push({
          fingerprint,
          severity: 'high',
          title: `Sensitive env var exposed to client: ${varName}`,
          description: `${varName} matches a sensitive variable pattern and uses a client-exposed prefix (NEXT_PUBLIC_, REACT_APP_, VITE_). This value will be bundled into client JavaScript.`,
          details: {
            variableName: varName,
            risk: 'client-exposed',
            clientFileCount: clientFiles.length,
          },
        });
      }
    }

    // Also flag sensitive vars referenced generally as informational
    for (const varName of sensitiveVars) {
      if (
        varName.startsWith('NEXT_PUBLIC_') ||
        varName.startsWith('REACT_APP_') ||
        varName.startsWith('VITE_')
      ) {
        continue; // Already flagged above
      }

      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.ENV_EXPOSURE}:server:${varName}`)
        .digest('hex');

      findings.push({
        fingerprint,
        severity: 'info',
        title: `Sensitive env var detected: ${varName}`,
        description: `${varName} matches a sensitive variable pattern and is referenced in the codebase. Ensure it is not committed to version control and is properly managed.`,
        details: {
          variableName: varName,
          risk: 'server-only',
        },
      });
    }

    return findings;
  }
}
