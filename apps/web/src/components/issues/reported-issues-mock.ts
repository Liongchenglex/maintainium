export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'new' | 'triaged' | 'needs-review' | 'diagnosed' | 'diagnosis-failed' | 'resolved';

export interface IssueDiagnosis {
  id: string;
  issueId: string;
  projectId: string;
  recommendationType: 'code-fix' | 'user-education' | 'needs-clarification' | 'escalation';
  summary: string;
  rootCause: string;
  complicationScore: number;
  proposedChanges: unknown | null;
  educationContent: string | null;
  clarificationQuestions: string[] | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportedIssue {
  id: string;
  projectId: string;
  reporterEmail: string;
  subject: string;
  description: string;
  priority: IssuePriority | null;
  status: IssueStatus;
  assignedArea: string | null;
  triageNotes: string | null;
  triageConfidence: number | null;
  createdAt: string;
  updatedAt: string;
  diagnosis?: IssueDiagnosis | null;
}
