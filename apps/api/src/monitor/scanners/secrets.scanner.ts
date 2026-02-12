import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

interface SecurityMetadata {
  hardcodedSecrets: string[];
}

@Injectable()
export class SecretsScanner {
  private readonly logger = new Logger(SecretsScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { analysis } = context;
    if (!analysis?.securityMetadata) {
      this.logger.warn('No security metadata available, skipping secrets scan');
      return [];
    }

    const security = analysis.securityMetadata as SecurityMetadata;
    const secrets = security.hardcodedSecrets || [];

    return secrets.map((filePath) => {
      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.SECRETS}:${filePath}`)
        .digest('hex');

      return {
        fingerprint,
        severity: 'critical' as const,
        title: `Potential hardcoded secret in ${filePath}`,
        description: `A pattern matching a hardcoded secret was detected in ${filePath}. Review and move to environment variables.`,
        details: {
          filePath,
        },
      };
    });
  }
}
