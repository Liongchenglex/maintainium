import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

@Injectable()
export class UptimeScanner {
  private readonly logger = new Logger(UptimeScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { project } = context;
    if (!project.productionUrl) {
      return [];
    }

    const url = project.productionUrl;
    const fingerprint = createHash('sha256')
      .update(`${SCANNER_IDS.UPTIME}:${url}`)
      .digest('hex');

    try {
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
      const responseTimeMs = Date.now() - startTime;

      const statusCode = response.status;
      const isSuccess = statusCode >= 200 && statusCode < 300;

      if (!isSuccess) {
        const severity = statusCode >= 500 ? 'critical' : 'high';
        return [
          {
            fingerprint,
            severity,
            title: `Site returning ${statusCode >= 500 ? 'server error' : 'non-success status'}: ${statusCode}`,
            description: `HTTP GET to ${url} returned status ${statusCode} (${responseTimeMs}ms response time).`,
            details: {
              url,
              statusCode,
              responseTimeMs,
              timestamp: new Date().toISOString(),
            },
          },
        ];
      }

      // Success — report healthy status as info finding
      return [
        {
          fingerprint,
          severity: 'info' as const,
          title: 'Site is reachable',
          description: `HTTP GET to ${url} returned ${statusCode} (${responseTimeMs}ms response time).`,
          details: {
            url,
            statusCode,
            responseTimeMs,
            timestamp: new Date().toISOString(),
          },
        },
      ];
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = message.includes('timeout') || message.includes('abort');

      return [
        {
          fingerprint,
          severity: 'critical',
          title: isTimeout
            ? 'Site unreachable: connection timeout'
            : 'Site unreachable',
          description: `HTTP GET to ${url} failed: ${message}`,
          details: {
            url,
            error: message,
            isTimeout,
            timestamp: new Date().toISOString(),
          },
        },
      ];
    }
  }
}
