import { Injectable, Logger } from '@nestjs/common';
import {
  FileRegistryEntry,
  DependencyGraph,
  DependencyEdge,
} from '../analysis.interfaces';

@Injectable()
export class DependencyGraphAnalyzer {
  private readonly logger = new Logger(DependencyGraphAnalyzer.name);

  analyze(fileRegistry: FileRegistryEntry[]): DependencyGraph {
    const filePaths = new Set(fileRegistry.map((f) => f.path));
    const edges = this.buildEdges(fileRegistry, filePaths);
    const reverseGraph = this.buildReverseGraph(edges, filePaths);
    const blastRadius = this.computeBlastRadius(reverseGraph, filePaths);
    const circularDependencies = this.detectCycles(edges, filePaths);
    const orphans = this.findOrphans(fileRegistry, reverseGraph);

    return { edges, blastRadius, circularDependencies, orphans };
  }

  private buildEdges(
    fileRegistry: FileRegistryEntry[],
    allPaths: Set<string>,
  ): DependencyEdge[] {
    const edges: DependencyEdge[] = [];

    for (const file of fileRegistry) {
      for (const imp of file.imports.internal) {
        // Try to resolve the import to an actual file
        const resolved = this.resolveImport(imp, allPaths);
        if (resolved) {
          edges.push({ source: file.path, target: resolved });
        }
      }
    }

    return edges;
  }

  private resolveImport(importPath: string, allPaths: Set<string>): string | null {
    // Direct match
    if (allPaths.has(importPath)) return importPath;

    // Try common extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
    for (const ext of extensions) {
      if (allPaths.has(importPath + ext)) return importPath + ext;
    }

    // Try index files
    for (const ext of extensions) {
      const indexPath = `${importPath}/index${ext}`;
      if (allPaths.has(indexPath)) return indexPath;
    }

    return null;
  }

  private buildReverseGraph(
    edges: DependencyEdge[],
    allPaths: Set<string>,
  ): Map<string, Set<string>> {
    const reverse = new Map<string, Set<string>>();
    for (const path of allPaths) {
      reverse.set(path, new Set());
    }
    for (const edge of edges) {
      reverse.get(edge.target)?.add(edge.source);
    }
    return reverse;
  }

  private computeBlastRadius(
    reverseGraph: Map<string, Set<string>>,
    allPaths: Set<string>,
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const path of allPaths) {
      // BFS to find all transitive dependents
      const visited = new Set<string>();
      const queue = [path];

      while (queue.length > 0) {
        const current = queue.shift()!;
        const dependents = reverseGraph.get(current);
        if (!dependents) continue;

        for (const dep of dependents) {
          if (!visited.has(dep) && dep !== path) {
            visited.add(dep);
            queue.push(dep);
          }
        }
      }

      if (visited.size > 0) {
        result[path] = visited.size;
      }
    }

    return result;
  }

  private detectCycles(
    edges: DependencyEdge[],
    allPaths: Set<string>,
  ): string[][] {
    // Build adjacency list
    const graph = new Map<string, string[]>();
    for (const path of allPaths) {
      graph.set(path, []);
    }
    for (const edge of edges) {
      graph.get(edge.source)?.push(edge.target);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (inStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            const cycle = [...path.slice(cycleStart), neighbor];
            cycles.push(cycle);
          }
        }
      }

      path.pop();
      inStack.delete(node);
    };

    for (const node of allPaths) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  private findOrphans(
    fileRegistry: FileRegistryEntry[],
    reverseGraph: Map<string, Set<string>>,
  ): string[] {
    const orphans: string[] = [];
    const nonOrphanCategories = new Set([
      'config', 'test', 'documentation', 'static-asset', 'migration',
    ]);

    for (const file of fileRegistry) {
      // Skip categories that are expected to be standalone
      if (nonOrphanCategories.has(file.category)) continue;

      // Check if anyone imports this file
      const importers = reverseGraph.get(file.path);
      if (!importers || importers.size === 0) {
        // Check if it's an entry point pattern
        if (this.isLikelyEntryPoint(file.path)) continue;
        orphans.push(file.path);
      }
    }

    return orphans;
  }

  private isLikelyEntryPoint(path: string): boolean {
    const lower = path.toLowerCase();
    return (
      lower.includes('main.ts') ||
      lower.includes('main.js') ||
      lower.endsWith('index.ts') ||
      lower.endsWith('index.js') ||
      lower.includes('app.ts') ||
      lower.includes('app.js') ||
      lower.includes('layout.tsx') ||
      lower.includes('page.tsx') ||
      lower.includes('page.ts') ||
      lower.includes('route.ts') ||
      lower.includes('route.js')
    );
  }
}
