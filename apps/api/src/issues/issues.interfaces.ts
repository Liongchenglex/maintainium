export interface IssueReceivedPayload {
  issueId: string;
  projectId: string;
}

export interface IssueTriagedPayload {
  issueId: string;
  projectId: string;
  assignedArea: string;
  userId: string;
}

export interface TriageLlmResponse {
  assignedArea: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  triageNotes: string;
  confidence: number;
  isTriageable: boolean;
}

export interface DiagnosisLlmResponse {
  recommendationType: 'code-fix' | 'user-education' | 'needs-clarification' | 'escalation';
  summary: string;
  rootCause: string;
  complicationScore: number;
  proposedChanges: ProposedChanges | null;
  educationContent: string | null;
  clarificationQuestions: string[] | null;
}

export interface ProposedChanges {
  diagnosis: {
    summary: string;
    rootCause: string;
    impact: string;
    confidence: 'high' | 'medium' | 'low';
  };
  proposal: {
    strategy: string;
    estimatedEffort: string;
    files: Array<{
      path: string;
      action: 'modify' | 'create' | 'delete';
      description: string;
    }>;
  };
  changes: Array<{
    filePath: string;
    language: string;
    hunks: Array<{
      header: string;
      lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }>;
    }>;
  }>;
  testScope: Array<{
    category: string;
    items: string[];
  }>;
}
