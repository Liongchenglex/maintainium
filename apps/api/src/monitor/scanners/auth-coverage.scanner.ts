import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

interface ApiRoute {
  path: string;
  method: string;
  handlerFile: string;
  handlerMethod: string;
  auth: boolean | 'unknown';
}

interface ApiSurface {
  routes: ApiRoute[];
}

const PUBLIC_ROUTE_PATTERNS = [
  /\/health/i,
  /\/ping/i,
  /\/public/i,
  /\/assets/i,
  /\/favicon/i,
  /\/_next/i,
];

@Injectable()
export class AuthCoverageScanner {
  private readonly logger = new Logger(AuthCoverageScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { analysis } = context;
    if (!analysis?.apiSurface) {
      this.logger.warn('No API surface available, skipping auth coverage scan');
      return [];
    }

    const surface = analysis.apiSurface as ApiSurface;
    const routes = surface.routes || [];
    const findings: FindingData[] = [];

    for (const route of routes) {
      if (route.auth === true) continue;
      if (this.isPublicRoute(route.path)) continue;

      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.AUTH_COVERAGE}:${route.method}:${route.path}`)
        .digest('hex');

      const severity = route.auth === false ? 'high' : 'medium';
      const authStatus =
        route.auth === false ? 'no authentication' : 'unknown authentication';

      findings.push({
        fingerprint,
        severity,
        title: `${route.method} ${route.path} has ${authStatus}`,
        description: `Route ${route.method} ${route.path} in ${route.handlerFile} does not have confirmed authentication. Review and add auth guards if needed.`,
        details: {
          method: route.method,
          path: route.path,
          handlerFile: route.handlerFile,
          handlerMethod: route.handlerMethod,
          authStatus: route.auth,
        },
      });
    }

    return findings;
  }

  private isPublicRoute(path: string): boolean {
    return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
  }
}
