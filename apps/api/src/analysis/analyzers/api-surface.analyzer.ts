import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  FileRegistryEntry,
  ApiSurface,
  ApiRoute,
  ExternalApiCall,
} from '../analysis.interfaces';

@Injectable()
export class ApiSurfaceAnalyzer {
  private readonly logger = new Logger(ApiSurfaceAnalyzer.name);

  async analyze(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
  ): Promise<ApiSurface> {
    const routes: ApiRoute[] = [];
    const externalCalls: ExternalApiCall[] = [];

    const candidateFiles = fileRegistry.filter(
      (f) =>
        f.category === 'api-route' ||
        f.category === 'service' ||
        f.category === 'page' ||
        f.category === 'middleware',
    );

    for (const file of candidateFiles) {
      try {
        const content = await readFile(join(repoPath, file.path), 'utf-8');

        // NestJS routes
        routes.push(...this.parseNestJsRoutes(content, file.path));

        // Express routes
        routes.push(...this.parseExpressRoutes(content, file.path));

        // Next.js App Router
        if (file.path.match(/app\/.*route\.(ts|js)$/)) {
          routes.push(...this.parseNextJsAppRoutes(content, file.path));
        }

        // Next.js Pages API
        if (file.path.match(/pages\/api\/.*\.(ts|js)$/)) {
          routes.push(...this.parseNextJsPagesApiRoutes(content, file.path));
        }

        // External API calls
        externalCalls.push(...this.parseExternalCalls(content, file.path));
      } catch {
        this.logger.warn(`Failed to analyze API surface for: ${file.path}`);
      }
    }

    return { routes, externalCalls };
  }

  private parseNestJsRoutes(code: string, filePath: string): ApiRoute[] {
    const routes: ApiRoute[] = [];

    // Find controller base path
    const controllerMatch = code.match(/@Controller\s*\(\s*['"]([^'"]*)['"]\s*\)/);
    const basePath = controllerMatch ? `/${controllerMatch[1]}` : '';

    // Check if AuthGuard is used at class level
    const classLevelAuth = code.includes('@UseGuards(AuthGuard)');

    // HTTP method decorators
    const methodDecorators = [
      { pattern: /@Get\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/, method: 'GET' },
      { pattern: /@Post\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/, method: 'POST' },
      { pattern: /@Put\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/, method: 'PUT' },
      { pattern: /@Patch\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/, method: 'PATCH' },
      { pattern: /@Delete\s*\(\s*(?:['"]([^'"]*)['"]\s*)?\)/, method: 'DELETE' },
    ];

    // Split into method blocks to detect per-method auth
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, method } of methodDecorators) {
        const match = lines[i].match(pattern);
        if (!match) continue;

        const routePath = match[1] || '';
        const fullPath = this.normalizePath(`${basePath}/${routePath}`);

        // Find handler method name (next non-decorator line with a method signature)
        let handlerMethod = 'unknown';
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const methodMatch = lines[j].match(/(?:async\s+)?(\w+)\s*\(/);
          if (methodMatch && !lines[j].trim().startsWith('@')) {
            handlerMethod = methodMatch[1];
            break;
          }
        }

        // Check for per-method auth (look at surrounding decorators)
        const methodBlockStart = Math.max(0, i - 5);
        const methodBlock = lines.slice(methodBlockStart, i + 1).join('\n');
        const hasMethodAuth = methodBlock.includes('@UseGuards(AuthGuard)');

        routes.push({
          path: fullPath,
          method,
          handlerFile: filePath,
          handlerMethod,
          auth: classLevelAuth || hasMethodAuth ? true : 'unknown',
        });
      }
    }

    return routes;
  }

  private parseExpressRoutes(code: string, filePath: string): ApiRoute[] {
    const routes: ApiRoute[] = [];

    const expressPatterns = [
      /(?:app|router)\.(get)\s*\(\s*['"]([^'"]+)['"]/gi,
      /(?:app|router)\.(post)\s*\(\s*['"]([^'"]+)['"]/gi,
      /(?:app|router)\.(put)\s*\(\s*['"]([^'"]+)['"]/gi,
      /(?:app|router)\.(patch)\s*\(\s*['"]([^'"]+)['"]/gi,
      /(?:app|router)\.(delete)\s*\(\s*['"]([^'"]+)['"]/gi,
    ];

    for (const pattern of expressPatterns) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        routes.push({
          path: match[2],
          method: match[1].toUpperCase(),
          handlerFile: filePath,
          handlerMethod: 'anonymous',
          auth: code.includes('requireAuth') || code.includes('passport') ? true : 'unknown',
        });
      }
    }

    return routes;
  }

  private parseNextJsAppRoutes(code: string, filePath: string): ApiRoute[] {
    const routes: ApiRoute[] = [];

    // Derive path from file path: app/api/users/route.ts → /api/users
    const pathMatch = filePath.match(/app\/(.*)\/route\.(ts|js)$/);
    if (!pathMatch) return routes;

    const routePath = '/' + pathMatch[1].replace(/\[(\w+)\]/g, ':$1');

    // Check which HTTP methods are exported
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    for (const method of methods) {
      if (code.includes(`export async function ${method}`) ||
          code.includes(`export function ${method}`) ||
          code.includes(`export const ${method}`)) {
        routes.push({
          path: routePath,
          method,
          handlerFile: filePath,
          handlerMethod: method,
          auth: 'unknown',
        });
      }
    }

    return routes;
  }

  private parseNextJsPagesApiRoutes(code: string, filePath: string): ApiRoute[] {
    const routes: ApiRoute[] = [];

    // Derive path from file path: pages/api/users/[id].ts → /api/users/:id
    const pathMatch = filePath.match(/pages\/(.*)$/);
    if (!pathMatch) return routes;

    const routePath = '/' + pathMatch[1]
      .replace(/\.(ts|js|tsx|jsx)$/, '')
      .replace(/\/index$/, '')
      .replace(/\[(\w+)\]/g, ':$1');

    routes.push({
      path: routePath,
      method: 'ALL',
      handlerFile: filePath,
      handlerMethod: 'default',
      auth: 'unknown',
    });

    return routes;
  }

  private parseExternalCalls(code: string, filePath: string): ExternalApiCall[] {
    const calls: ExternalApiCall[] = [];
    const seen = new Set<string>();

    // fetch('https://...')
    const fetchMatches = code.matchAll(/fetch\s*\(\s*[`'"](https?:\/\/[^'"`\s]+)/g);
    for (const match of fetchMatches) {
      const url = match[1];
      const service = this.extractServiceName(url);
      const key = `${service}:${filePath}`;
      if (!seen.has(key)) {
        seen.add(key);
        calls.push({ service, url: this.extractBaseUrl(url), callerFile: filePath });
      }
    }

    // Template literal fetch
    const templateFetchMatches = code.matchAll(/fetch\s*\(\s*`(https?:\/\/[^`]+)`/g);
    for (const match of templateFetchMatches) {
      const url = match[1].split('$')[0]; // Get base part before template expressions
      const service = this.extractServiceName(url);
      const key = `${service}:${filePath}`;
      if (!seen.has(key)) {
        seen.add(key);
        calls.push({ service, url: this.extractBaseUrl(url), callerFile: filePath });
      }
    }

    // axios calls
    const axiosMatches = code.matchAll(/axios\.\w+\s*\(\s*[`'"](https?:\/\/[^'"`\s]+)/g);
    for (const match of axiosMatches) {
      const url = match[1];
      const service = this.extractServiceName(url);
      const key = `${service}:${filePath}`;
      if (!seen.has(key)) {
        seen.add(key);
        calls.push({ service, url: this.extractBaseUrl(url), callerFile: filePath });
      }
    }

    return calls;
  }

  private extractServiceName(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes('github')) return 'github';
      if (hostname.includes('google')) return 'google';
      if (hostname.includes('stripe')) return 'stripe';
      if (hostname.includes('firebase')) return 'firebase';
      if (hostname.includes('npm')) return 'npm';
      return hostname.split('.').slice(-2, -1)[0] || hostname;
    } catch {
      return 'unknown';
    }
  }

  private extractBaseUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return url;
    }
  }

  private normalizePath(path: string): string {
    return '/' + path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  }
}
