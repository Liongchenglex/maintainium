import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { SCANNER_IDS } from '../monitor.constants';
import { FindingData, ScanContext } from '../monitor.interfaces';

interface DependencyGraph {
  orphans: string[];
  circularDependencies: string[][];
}

@Injectable()
export class CodeHealthScanner {
  private readonly logger = new Logger(CodeHealthScanner.name);

  async scan(context: ScanContext): Promise<FindingData[]> {
    const { analysis } = context;
    if (!analysis?.dependencyGraph) {
      this.logger.warn('No dependency graph available, skipping code health scan');
      return [];
    }

    const graph = analysis.dependencyGraph as DependencyGraph;
    const findings: FindingData[] = [];

    // Orphan files
    for (const orphan of graph.orphans || []) {
      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.CODE_HEALTH}:orphan:${orphan}`)
        .digest('hex');

      findings.push({
        fingerprint,
        severity: 'low',
        title: `Orphan file: ${orphan}`,
        description: `${orphan} has no imports or exports and may be dead code. Consider removing it or connecting it to the dependency graph.`,
        details: {
          type: 'orphan',
          filePath: orphan,
        },
      });
    }

    // Circular dependencies
    for (const cycle of graph.circularDependencies || []) {
      const cycleKey = [...cycle].sort().join(',');
      const fingerprint = createHash('sha256')
        .update(`${SCANNER_IDS.CODE_HEALTH}:circular:${cycleKey}`)
        .digest('hex');

      findings.push({
        fingerprint,
        severity: 'low',
        title: `Circular dependency: ${cycle.length} files`,
        description: `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}. This can cause initialization issues and makes code harder to maintain.`,
        details: {
          type: 'circular-dependency',
          files: cycle,
        },
      });
    }

    return findings;
  }
}
