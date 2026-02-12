import { Project } from '../database/schema';
import { CodebaseAnalysis } from '../database/schema';

// ── Event Payloads ──

export interface ScanRequestedPayload {
  projectId: string;
  userId: string;
  trigger: 'manual' | 'auto' | 'scheduled';
}

// ── Scanner Context ──

export interface ScanContext {
  project: Project;
  analysis: CodebaseAnalysis | null;
  githubToken: string | null;
}

// ── Scanner Output ──

export interface FindingData {
  fingerprint: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  details: Record<string, unknown>;
}

export interface ScannerResult {
  scanner: string;
  findings: FindingData[];
}

// ── Scanner Interface ──

export interface Scanner {
  scan(context: ScanContext): Promise<FindingData[]>;
}
