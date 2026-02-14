'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { get, post, patch } from '@/lib/api';
import { Spinner } from '../ui/spinner';
import { DiffView } from '../monitor/diff-view';
import type { ReportedIssue, IssueDiagnosis, IssuePriority, IssueStatus } from './reported-issues-mock';

// ── Types ──

interface IssueWithDiagnosis extends ReportedIssue {
  diagnosis: IssueDiagnosis | null;
}

interface InvestigationData {
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

// ── Color Maps ──

const PRIORITY_COLORS: Record<IssuePriority, { bg: string; text: string; border: string }> = {
  critical: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
  high: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  medium: { bg: '#fffde7', text: '#f9a825', border: '#fff176' },
  low: { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
};

const STATUS_COLORS: Record<IssueStatus, { bg: string; text: string; border: string }> = {
  new: { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
  triaged: { bg: '#f3e8ff', text: '#7c3aed', border: '#d8b4fe' },
  'needs-review': { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  diagnosed: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
  'diagnosis-failed': { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
  resolved: { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
};

const REC_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'code-fix': { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
  'user-education': { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
  'needs-clarification': { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  escalation: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
};

const SCORE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
  medium: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  high: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
};

function getScoreLevel(score: number): 'low' | 'medium' | 'high' {
  if (score <= 3) return 'low';
  if (score <= 6) return 'medium';
  return 'high';
}

// ── Component ──

export function IssueDetailCard() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const issueId = params.issueId as string;

  const [issue, setIssue] = useState<IssueWithDiagnosis | null>(null);
  const [featureAreas, setFeatureAreas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [selectedArea, setSelectedArea] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchIssue = useCallback(async () => {
    try {
      const data = await get<IssueWithDiagnosis>(
        `/projects/${projectId}/issues/${issueId}`,
      );
      setIssue(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issue');
      return null;
    }
  }, [projectId, issueId]);

  // Initial load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [issueData, areas] = await Promise.all([
          get<IssueWithDiagnosis>(`/projects/${projectId}/issues/${issueId}`),
          get<string[]>(`/projects/${projectId}/feature-areas`),
        ]);
        setIssue(issueData);
        setFeatureAreas(areas);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load issue');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [projectId, issueId]);

  // Poll while triaging (status=new) or diagnosing (user triggered diagnosis)
  useEffect(() => {
    const shouldPoll =
      issue?.status === 'new' || (diagnosing && issue?.status === 'triaged');

    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await fetchIssue();
        if (updated && updated.status !== 'new' && updated.status !== 'triaged') {
          setDiagnosing(false);
        }
      }, 3000);
    } else if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [issue?.status, diagnosing, fetchIssue]);

  const handleResolve = async () => {
    setResolving(true);
    try {
      await patch(`/projects/${projectId}/issues/${issueId}/resolve`);
      const updated = await get<IssueWithDiagnosis>(`/projects/${projectId}/issues/${issueId}`);
      setIssue(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve');
    } finally {
      setResolving(false);
    }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      await post(`/projects/${projectId}/issues/${issueId}/diagnose`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start diagnosis');
      setDiagnosing(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedArea) return;
    setReassigning(true);
    try {
      await patch(`/projects/${projectId}/issues/${issueId}/reassign`, {
        assignedArea: selectedArea,
      });
      const updated = await get<IssueWithDiagnosis>(`/projects/${projectId}/issues/${issueId}`);
      setIssue(updated);
      setSelectedArea('');
      setDiagnosing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign');
    } finally {
      setReassigning(false);
    }
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', padding: '3rem', justifyContent: 'center' }}>
          <Spinner color="#666" size={14} />
          <span>Loading issue details...</span>
        </div>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#c62828', padding: '2rem' }}>{error || 'Issue not found'}</p>
        <button onClick={() => router.back()} style={backLinkStyle}>Back to Issues</button>
      </div>
    );
  }

  const statusColors = STATUS_COLORS[issue.status];
  const prioColors = issue.priority ? PRIORITY_COLORS[issue.priority] : null;
  const diag = issue.diagnosis;
  const proposed = diag?.proposedChanges as InvestigationData | null;
  const hasChanges = proposed?.changes && proposed.changes.length > 0;
  const canAutoImplement =
    diag?.recommendationType === 'code-fix' &&
    diag.complicationScore <= 6;

  return (
    <div style={pageStyle}>
      {/* ── Breadcrumb ── */}
      <div style={breadcrumbBarStyle}>
        <button
          onClick={() => router.push(`/dashboard/projects/${projectId}?tab=issues`)}
          style={backLinkStyle}
        >
          Reported Issues
        </button>
        <span style={{ color: '#999', margin: '0 0.4rem' }}>/</span>
        <span style={{ fontSize: '0.82rem', color: '#555' }}>Issue Detail</span>
      </div>

      {/* ── Header Strip ── */}
      <div style={headerStripStyle}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ ...chipStyle, backgroundColor: statusColors.bg, color: statusColors.text, border: `1px solid ${statusColors.border}` }}>
              {issue.status}
            </span>
            {prioColors && (
              <span style={{ ...chipStyle, backgroundColor: prioColors.bg, color: prioColors.text, border: `1px solid ${prioColors.border}` }}>
                {issue.priority}
              </span>
            )}
            {issue.assignedArea && (
              <span style={{ ...chipStyle, backgroundColor: '#f3e8ff', color: '#7c3aed', border: '1px solid #d8b4fe' }}>
                {issue.assignedArea}
              </span>
            )}
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#1a1a1a' }}>
            {issue.subject}
          </h1>
        </div>
      </div>

      {/* ── Two-Column Body ── */}
      <div style={bodyStyle}>
        {/* ── Main Column ── */}
        <div style={mainColumnStyle}>
          {/* Issue Description */}
          <Panel title="Issue Description">
            <DetailRow label="Reporter" value={issue.reporterEmail} />
            <DetailRow label="Description" value={issue.description} />
            {issue.triageNotes && (
              <DetailRow label="Triage Notes" value={issue.triageNotes} last />
            )}
          </Panel>

          {/* Diagnosis (if available) */}
          {diag && (
            <>
              <Panel title="Diagnosis">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  {(() => {
                    const recColors = REC_TYPE_COLORS[diag.recommendationType] ?? REC_TYPE_COLORS.escalation;
                    return (
                      <span style={{ ...chipStyle, backgroundColor: recColors.bg, color: recColors.text, border: `1px solid ${recColors.border}` }}>
                        {diag.recommendationType}
                      </span>
                    );
                  })()}
                  {(() => {
                    const scoreLevel = getScoreLevel(diag.complicationScore);
                    const scoreColors = SCORE_COLORS[scoreLevel];
                    return (
                      <span style={{ ...chipStyle, backgroundColor: scoreColors.bg, color: scoreColors.text, border: `1px solid ${scoreColors.border}` }}>
                        Complexity: {diag.complicationScore}/10
                      </span>
                    );
                  })()}
                </div>
                <DetailRow label="Summary" value={diag.summary} />
                <DetailRow label="Root Cause" value={diag.rootCause} last />
              </Panel>

              {/* Proposed Implementation (code-fix only) */}
              {proposed?.proposal && (
                <Panel title="Proposed Implementation">
                  <DetailRow label="Strategy" value={proposed.proposal.strategy} />
                  <DetailRow label="Estimated Effort" value={proposed.proposal.estimatedEffort} last={proposed.proposal.files.length === 0} />
                  {proposed.proposal.files.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <span style={detailLabelStyle}>Files to Change</span>
                      <div style={{ marginTop: '0.3rem' }}>
                        {proposed.proposal.files.map((f, i) => (
                          <div key={i} style={fileRowStyle}>
                            <span style={actionBadgeStyle(f.action)}>{f.action}</span>
                            <code style={{ fontSize: '0.8rem', color: '#333' }}>{f.path}</code>
                            <span style={{ fontSize: '0.78rem', color: '#888' }}>&mdash; {f.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Panel>
              )}

              {/* Changes (DiffView) */}
              {hasChanges && (
                <Panel title="Changes">
                  <DiffView changes={proposed!.changes} />
                </Panel>
              )}

              {/* Test Scope */}
              {proposed?.testScope && proposed.testScope.length > 0 && (
                <Panel title="Test Scope">
                  {proposed.testScope.map((group, i) => (
                    <div key={i} style={{ marginBottom: i < proposed.testScope.length - 1 ? '0.6rem' : 0 }}>
                      <span style={detailLabelStyle}>{group.category}</span>
                      <ul style={{ margin: '0.25rem 0 0 1.2rem', padding: 0 }}>
                        {group.items.map((item, j) => (
                          <li key={j} style={{ fontSize: '0.83rem', color: '#444', lineHeight: 1.6 }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Panel>
              )}

              {/* Education Content */}
              {diag.recommendationType === 'user-education' && diag.educationContent && (
                <Panel title="User Education">
                  <p style={{ fontSize: '0.85rem', color: '#333', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                    {diag.educationContent}
                  </p>
                </Panel>
              )}

              {/* Clarification Questions */}
              {diag.recommendationType === 'needs-clarification' && diag.clarificationQuestions && (
                <Panel title="Questions for Reporter">
                  <ul style={{ margin: 0, padding: '0 0 0 1.2rem' }}>
                    {(diag.clarificationQuestions as string[]).map((q, i) => (
                      <li key={i} style={{ fontSize: '0.85rem', color: '#333', lineHeight: 1.6, marginBottom: '0.4rem' }}>
                        {q}
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </>
          )}

          {/* Triaging in progress */}
          {issue.status === 'new' && (
            <Panel title="Triage">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.5rem', color: '#1565c0' }}>
                <Spinner color="#1565c0" size={14} />
                <span>AI triage agent is classifying this issue...</span>
              </div>
            </Panel>
          )}

          {/* Triaged — awaiting user action */}
          {issue.status === 'triaged' && !diag && !diagnosing && (
            <Panel title="Diagnosis">
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#555', margin: '0 0 1rem 0' }}>
                  Issue has been triaged to <strong>{issue.assignedArea}</strong>. Ready for AI diagnosis.
                </p>
                <button onClick={handleDiagnose} style={diagnoseButtonStyle}>
                  Proceed with Diagnosis
                </button>
              </div>
            </Panel>
          )}

          {/* Diagnosis in progress */}
          {diagnosing && issue.status === 'triaged' && !diag && (
            <Panel title="Diagnosis">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1.5rem', color: '#7c3aed' }}>
                <Spinner color="#7c3aed" size={14} />
                <span>AI diagnosis agent is analyzing the issue...</span>
              </div>
            </Panel>
          )}

          {/* Diagnosis failed */}
          {!diag && issue.status === 'diagnosis-failed' && (
            <Panel title="Diagnosis">
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#c62828' }}>
                Diagnosis failed. Try reassigning to a different area.
              </div>
            </Panel>
          )}

          {/* Needs review (no diagnosis possible) */}
          {!diag && issue.status === 'needs-review' && (
            <Panel title="Status">
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#e65100' }}>
                {issue.triageNotes || 'This issue requires manual review.'}
              </div>
            </Panel>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div style={sidebarColumnStyle}>
          {/* Details */}
          <Panel title="Details">
            <SidebarRow label="Status">
              <span style={{ ...chipStyle, backgroundColor: statusColors.bg, color: statusColors.text, border: `1px solid ${statusColors.border}`, fontSize: '0.72rem' }}>
                {issue.status}
              </span>
            </SidebarRow>
            {issue.priority && (
              <SidebarRow label="Priority">
                <span style={{ ...chipStyle, backgroundColor: prioColors!.bg, color: prioColors!.text, border: `1px solid ${prioColors!.border}`, fontSize: '0.72rem' }}>
                  {issue.priority}
                </span>
              </SidebarRow>
            )}
            {issue.assignedArea && (
              <SidebarRow label="Area">
                <span style={{ fontSize: '0.82rem', color: '#333' }}>{issue.assignedArea}</span>
              </SidebarRow>
            )}
            <SidebarRow label="Reporter">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>{issue.reporterEmail}</span>
            </SidebarRow>
            {diag && (
              <>
                <SidebarRow label="Complexity">
                  <span style={{ fontSize: '0.82rem', color: '#333' }}>{diag.complicationScore}/10</span>
                </SidebarRow>
                <SidebarRow label="Type">
                  <span style={{ fontSize: '0.82rem', color: '#333' }}>{diag.recommendationType}</span>
                </SidebarRow>
              </>
            )}
            {issue.triageConfidence !== null && (
              <SidebarRow label="Confidence">
                <span style={{ fontSize: '0.82rem', color: '#333' }}>
                  {Math.round((issue.triageConfidence ?? 0) * 100)}%
                </span>
              </SidebarRow>
            )}
            <SidebarRow label="Reported">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {new Date(issue.createdAt).toLocaleDateString()}
              </span>
            </SidebarRow>
            <SidebarRow label="Updated" last>
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {new Date(issue.updatedAt).toLocaleDateString()}
              </span>
            </SidebarRow>
          </Panel>

          {/* Actions */}
          <Panel title="Actions">
            {/* Implement Button */}
            {diag?.recommendationType === 'code-fix' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <button
                  disabled={!canAutoImplement}
                  style={{
                    ...actionButtonStyle,
                    backgroundColor: canAutoImplement ? '#7c3aed' : '#e0e0e0',
                    borderColor: canAutoImplement ? '#7c3aed' : '#e0e0e0',
                    color: canAutoImplement ? '#fff' : '#999',
                    cursor: canAutoImplement ? 'pointer' : 'not-allowed',
                    width: '100%',
                  }}
                  title={
                    canAutoImplement
                      ? 'Creates a branch and PR with proposed changes (coming soon)'
                      : `Complexity score ${diag.complicationScore}/10 is too high for auto-implementation`
                  }
                >
                  Implement Changes
                </button>
                {!canAutoImplement && diag.complicationScore > 6 && (
                  <p style={{ fontSize: '0.72rem', color: '#999', margin: '0.3rem 0 0 0', textAlign: 'center' }}>
                    Too complex for auto-implementation (score {diag.complicationScore}/10)
                  </p>
                )}
                {canAutoImplement && (
                  <p style={{ fontSize: '0.72rem', color: '#999', margin: '0.3rem 0 0 0', textAlign: 'center' }}>
                    Coming soon
                  </p>
                )}
              </div>
            )}

            {/* Resolve Button */}
            {issue.status !== 'resolved' && (
              <button
                onClick={handleResolve}
                disabled={resolving}
                style={{
                  ...actionButtonStyle,
                  backgroundColor: '#2e7d32',
                  borderColor: '#2e7d32',
                  color: '#fff',
                  width: '100%',
                  marginBottom: '0.75rem',
                }}
              >
                {resolving ? 'Resolving...' : 'Mark as Resolved'}
              </button>
            )}

            {/* Reassign */}
            {featureAreas.length > 0 && issue.status !== 'resolved' && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b778c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: '0.3rem' }}>
                  Reassign to Area
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select area...</option>
                    {featureAreas
                      .filter((a) => a !== issue.assignedArea)
                      .map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                  </select>
                  <button
                    onClick={handleReassign}
                    disabled={!selectedArea || reassigning}
                    style={{
                      ...actionButtonStyle,
                      backgroundColor: selectedArea ? '#1565c0' : '#e0e0e0',
                      borderColor: selectedArea ? '#1565c0' : '#e0e0e0',
                      color: selectedArea ? '#fff' : '#999',
                      cursor: selectedArea ? 'pointer' : 'not-allowed',
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.65rem',
                      flexShrink: 0,
                    }}
                  >
                    {reassigning ? '...' : 'Reassign'}
                  </button>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ──

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelHeaderTextStyle}>{title}</span>
      </div>
      <div style={panelBodyStyle}>{children}</div>
    </div>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 0 : '0.6rem' }}>
      <span style={detailLabelStyle}>{label}</span>
      <p style={detailValueStyle}>{value}</p>
    </div>
  );
}

function SidebarRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.4rem 0',
      borderBottom: last ? 'none' : '1px solid #f0f0f0',
    }}>
      <span style={{ fontSize: '0.78rem', color: '#888', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

function actionBadgeStyle(action: 'modify' | 'create' | 'delete'): React.CSSProperties {
  const colors = {
    modify: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
    create: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
    delete: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
  };
  const c = colors[action];
  return {
    display: 'inline-block',
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
    backgroundColor: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
    textTransform: 'uppercase',
    flexShrink: 0,
  };
}

// ── Styles ──

const pageStyle: React.CSSProperties = {
  maxWidth: '1100px',
  margin: '0 auto',
  padding: '1rem',
};

const breadcrumbBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0.5rem 0',
  marginBottom: '0.5rem',
};

const backLinkStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  color: '#1565c0',
  textDecoration: 'none',
  fontWeight: 500,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
};

const headerStripStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '1rem',
  paddingBottom: '1rem',
  marginBottom: '1rem',
  borderBottom: '1px solid #e0e0e0',
  flexWrap: 'wrap',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.15rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.73rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
};

const mainColumnStyle: React.CSSProperties = {
  flex: '1 1 580px',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const sidebarColumnStyle: React.CSSProperties = {
  flex: '0 0 280px',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const panelStyle: React.CSSProperties = {
  border: '1px solid #dfe1e6',
  borderRadius: '4px',
  backgroundColor: '#fff',
  overflow: 'hidden',
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.5rem 0.75rem',
  backgroundColor: '#f4f5f7',
  borderBottom: '1px solid #dfe1e6',
};

const panelHeaderTextStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#42526e',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const panelBodyStyle: React.CSSProperties = {
  padding: '0.75rem',
};

const detailLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#6b778c',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: '0.15rem',
};

const detailValueStyle: React.CSSProperties = {
  fontSize: '0.83rem',
  color: '#333',
  lineHeight: 1.5,
  margin: 0,
};

const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.25rem 0',
  flexWrap: 'wrap',
};

const actionButtonStyle: React.CSSProperties = {
  padding: '0.45rem 1rem',
  borderRadius: '4px',
  border: '1px solid',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const diagnoseButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  borderRadius: '4px',
  border: '1px solid #7c3aed',
  backgroundColor: '#7c3aed',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const selectStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  fontSize: '0.82rem',
  color: '#333',
  backgroundColor: '#fff',
  flex: 1,
  minWidth: 0,
};
