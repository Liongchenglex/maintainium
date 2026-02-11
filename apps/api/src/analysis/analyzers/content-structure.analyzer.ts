import { Injectable, Logger } from '@nestjs/common';
import { readdir } from 'fs/promises';
import { join } from 'path';
import {
  FileRegistryEntry,
  DependencyGraph,
  ContentStructure,
  PageTreeEntry,
} from '../analysis.interfaces';

@Injectable()
export class ContentStructureAnalyzer {
  private readonly logger = new Logger(ContentStructureAnalyzer.name);

  async analyze(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
    dependencyGraph: DependencyGraph,
  ): Promise<ContentStructure> {
    const pageTree = await this.buildPageTree(repoPath, fileRegistry);
    const componentHierarchy = this.buildComponentHierarchy(fileRegistry, dependencyGraph);
    const middlewareChain = this.buildMiddlewareChain(fileRegistry);

    return { pageTree, componentHierarchy, middlewareChain };
  }

  private async buildPageTree(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
  ): Promise<PageTreeEntry[]> {
    const pages: PageTreeEntry[] = [];

    for (const file of fileRegistry) {
      // Next.js App Router: app/**/page.tsx
      const appRouterMatch = file.path.match(/app\/(.+)\/page\.(tsx?|jsx?)$/);
      if (appRouterMatch) {
        const routePath = '/' + appRouterMatch[1]
          .replace(/\[(\w+)\]/g, ':$1')
          .replace(/\([\w-]+\)\//g, ''); // Remove route groups
        pages.push({ path: routePath, filePath: file.path });
        continue;
      }

      // Next.js App Router: app/page.tsx (root)
      if (file.path.match(/app\/page\.(tsx?|jsx?)$/)) {
        pages.push({ path: '/', filePath: file.path });
        continue;
      }

      // Next.js Pages Router: pages/*.tsx
      const pagesMatch = file.path.match(/pages\/(.+)\.(tsx?|jsx?)$/);
      if (pagesMatch && !file.path.includes('/api/') && !file.path.includes('_app') && !file.path.includes('_document')) {
        const routePath = '/' + pagesMatch[1]
          .replace(/\/index$/, '')
          .replace(/\[(\w+)\]/g, ':$1');
        pages.push({ path: routePath || '/', filePath: file.path });
      }
    }

    return pages.sort((a, b) => a.path.localeCompare(b.path));
  }

  private buildComponentHierarchy(
    fileRegistry: FileRegistryEntry[],
    dependencyGraph: DependencyGraph,
  ): { file: string; children: string[] }[] {
    const hierarchy: { file: string; children: string[] }[] = [];

    // Find layout files (top-level)
    const layouts = fileRegistry.filter(
      (f) => f.path.includes('layout.') && f.category === 'page',
    );

    // Find page files
    const pages = fileRegistry.filter(
      (f) => f.category === 'page' && !f.path.includes('layout.'),
    );

    // Build forward graph from edges
    const forwardGraph = new Map<string, string[]>();
    for (const edge of dependencyGraph.edges) {
      if (!forwardGraph.has(edge.source)) {
        forwardGraph.set(edge.source, []);
      }
      forwardGraph.get(edge.source)!.push(edge.target);
    }

    // For each layout/page, find its component children
    for (const file of [...layouts, ...pages]) {
      const children = (forwardGraph.get(file.path) || []).filter((child) => {
        const childFile = fileRegistry.find((f) => f.path === child);
        return childFile && (childFile.category === 'component' || childFile.category === 'page');
      });

      if (children.length > 0) {
        hierarchy.push({ file: file.path, children });
      }
    }

    return hierarchy;
  }

  private buildMiddlewareChain(fileRegistry: FileRegistryEntry[]): string[] {
    const middleware: string[] = [];

    // NestJS middleware/guards/interceptors
    const middlewareFiles = fileRegistry
      .filter((f) => f.category === 'middleware')
      .sort((a, b) => {
        // Guards before interceptors before filters
        const order = (path: string) => {
          if (path.includes('.guard.')) return 0;
          if (path.includes('.interceptor.')) return 1;
          if (path.includes('.middleware.')) return 2;
          if (path.includes('.filter.')) return 3;
          return 4;
        };
        return order(a.path) - order(b.path);
      });

    for (const file of middlewareFiles) {
      middleware.push(file.path);
    }

    // Next.js middleware
    const nextMiddleware = fileRegistry.find(
      (f) => f.path === 'middleware.ts' || f.path === 'middleware.js' ||
        f.path === 'src/middleware.ts' || f.path === 'src/middleware.js',
    );
    if (nextMiddleware) {
      middleware.unshift(nextMiddleware.path);
    }

    return middleware;
  }
}
