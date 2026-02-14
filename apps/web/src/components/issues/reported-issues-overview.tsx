'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { get } from '@/lib/api';
import { Spinner } from '../ui/spinner';
import { SubmitIssueForm } from './submit-issue-form';
import type { ReportedIssue, IssuePriority, IssueStatus } from './reported-issues-mock';

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

const DEFAULT_AREA_COLOR = { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' };

// ── Props ──

interface ReportedIssuesOverviewProps {
  projectId: string;
}

// ── Component ──

export function ReportedIssuesOverview({ projectId }: ReportedIssuesOverviewProps) {
  const router = useRouter();
  const [issues, setIssues] = useState<ReportedIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [showSubmitForm, setShowSubmitForm] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchIssues = useCallback(async () => {
    try {
      const data = await get<ReportedIssue[]>(`/projects/${projectId}/issues`);
      setIssues(data);
      return data;
    } catch {
      setIssues([]);
      return [];
    }
  }, [projectId]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchIssues();
      setLoading(false);
    };
    load();
  }, [fetchIssues]);

  // Poll while any issue is in a processing state (new or triaged)
  useEffect(() => {
    const hasProcessing = issues.some(
      (i) => i.status === 'new' || i.status === 'triaged',
    );

    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(() => {
        fetchIssues();
      }, 3000);
    } else if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [issues, fetchIssues]);

  const filteredIssues = issues.filter((issue) => {
    if (statusFilter !== 'all' && issue.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && issue.priority !== priorityFilter) return false;
    if (areaFilter !== 'all' && issue.assignedArea !== areaFilter) return false;
    return true;
  });

  const uniqueAreas = Array.from(
    new Set(issues.map((i) => i.assignedArea).filter(Boolean) as string[]),
  ).sort();

  const priorityCounts = issues.reduce(
    (acc, issue) => {
      if (issue.priority) {
        acc[issue.priority] = (acc[issue.priority] || 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', padding: '3rem', justifyContent: 'center' }}>
        <Spinner color="#666" size={14} />
        <span>Loading reported issues...</span>
      </div>
    );
  }

  return (
    <div>
      {/* ── Header Row ── */}
      <div style={headerRowStyle}>
        <h2 style={titleStyle}>Reported Issues</h2>
        <button onClick={() => setShowSubmitForm(true)} style={submitButtonStyle}>
          + Submit Issue
        </button>
      </div>

      {/* ── Priority Summary ── */}
      {issues.length > 0 && (
        <div style={summaryRowStyle}>
          {(['critical', 'high', 'medium', 'low'] as IssuePriority[]).map((p) => {
            const count = priorityCounts[p] || 0;
            if (count === 0) return null;
            const colors = PRIORITY_COLORS[p];
            return (
              <span
                key={p}
                style={{
                  ...chipStyle,
                  backgroundColor: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                {p}: {count}
              </span>
            );
          })}
          <span style={{ fontSize: '0.82rem', color: '#888' }}>
            {issues.length} total
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      {issues.length > 0 && (
        <div style={filterBarStyle}>
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={['all', 'new', 'triaged', 'needs-review', 'diagnosed', 'diagnosis-failed', 'resolved']}
          />
          <FilterSelect
            label="Priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={['all', 'critical', 'high', 'medium', 'low']}
          />
          {uniqueAreas.length > 0 && (
            <FilterSelect
              label="Area"
              value={areaFilter}
              onChange={setAreaFilter}
              options={['all', ...uniqueAreas]}
            />
          )}
        </div>
      )}

      {/* ── Issue Cards ── */}
      {filteredIssues.length > 0 ? (
        <div style={cardsContainerStyle}>
          {filteredIssues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onClick={() => router.push(`/dashboard/projects/${projectId}/issues/${issue.id}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState hasIssues={issues.length > 0} onSubmit={() => setShowSubmitForm(true)} />
      )}

      {/* ── Submit Form Modal ── */}
      {showSubmitForm && (
        <SubmitIssueForm
          projectId={projectId}
          onSubmitted={() => {
            setShowSubmitForm(false);
            fetchIssues();
          }}
          onCancel={() => setShowSubmitForm(false)}
        />
      )}
    </div>
  );
}

// ── Sub-Components ──

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelHeaderTextStyle}>{title}</span>
      </div>
      <div style={panelBodyStyle}>{children}</div>
    </div>
  );
}

function IssueCard({ issue, onClick }: { issue: ReportedIssue; onClick: () => void }) {
  const statusColors = STATUS_COLORS[issue.status];

  return (
    <div onClick={onClick} style={{ cursor: 'pointer' }}>
      <Panel title={issue.subject}>
        <div style={cardBodyStyle}>
          {/* Left: description + triage */}
          <div style={cardLeftStyle}>
            <div style={{ marginBottom: '0.6rem' }}>
              <span style={detailLabelStyle}>Description</span>
              <p style={detailValueStyle}>
                {issue.description.length > 200
                  ? issue.description.slice(0, 200) + '...'
                  : issue.description}
              </p>
            </div>
            {issue.triageNotes && (
              <div>
                <span style={detailLabelStyle}>Triage Notes</span>
                <p style={detailValueStyle}>{issue.triageNotes}</p>
              </div>
            )}
          </div>

          {/* Right: metadata */}
          <div style={cardRightStyle}>
            {issue.priority && (
              <MetaRow label="Priority">
                <span style={{
                  ...chipStyle,
                  backgroundColor: PRIORITY_COLORS[issue.priority].bg,
                  color: PRIORITY_COLORS[issue.priority].text,
                  border: `1px solid ${PRIORITY_COLORS[issue.priority].border}`,
                }}>
                  {issue.priority}
                </span>
              </MetaRow>
            )}
            <MetaRow label="Status">
              <span style={{
                ...chipStyle,
                backgroundColor: statusColors.bg,
                color: statusColors.text,
                border: `1px solid ${statusColors.border}`,
              }}>
                {issue.status}
              </span>
            </MetaRow>
            {issue.assignedArea && (
              <MetaRow label="Area">
                <span style={{
                  ...chipStyle,
                  backgroundColor: DEFAULT_AREA_COLOR.bg,
                  color: DEFAULT_AREA_COLOR.text,
                  border: `1px solid ${DEFAULT_AREA_COLOR.border}`,
                }}>
                  {issue.assignedArea}
                </span>
              </MetaRow>
            )}
            <MetaRow label="Reporter">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>{issue.reporterEmail}</span>
            </MetaRow>
            <MetaRow label="Reported">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {new Date(issue.createdAt).toLocaleDateString()}
              </span>
            </MetaRow>
            {issue.triageConfidence !== null && (
              <MetaRow label="Confidence" last>
                <span style={{ fontSize: '0.82rem', color: '#333' }}>
                  {Math.round((issue.triageConfidence ?? 0) * 100)}%
                </span>
              </MetaRow>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function MetaRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.35rem 0',
      borderBottom: last ? 'none' : '1px solid #f0f0f0',
    }}>
      <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label style={filterLabelStyle}>
      <span style={{ fontSize: '0.75rem', color: '#6b778c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={selectStyle}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === 'all' ? `All ${label}s` : opt.charAt(0).toUpperCase() + opt.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ hasIssues, onSubmit }: { hasIssues: boolean; onSubmit: () => void }) {
  return (
    <div style={emptyStateStyle}>
      <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#555', marginBottom: '0.3rem' }}>
        {hasIssues ? 'No issues match your filters' : 'No reported issues yet'}
      </p>
      <p style={{ fontSize: '0.83rem', color: '#999', margin: 0, marginBottom: '1rem' }}>
        {hasIssues
          ? 'Try adjusting the status, priority, or area filters above.'
          : 'Submit an issue manually to trigger the AI triage and diagnosis pipeline.'}
      </p>
      {!hasIssues && (
        <button onClick={onSubmit} style={submitButtonStyle}>
          + Submit First Issue
        </button>
      )}
    </div>
  );
}

// ── Styles ──

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.75rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 600,
  color: '#1a1a1a',
  margin: 0,
};

const submitButtonStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  borderRadius: '4px',
  border: '1px solid #1565c0',
  backgroundColor: '#1565c0',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 600,
};

const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '0.75rem',
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

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  marginBottom: '1rem',
  flexWrap: 'wrap',
};

const filterLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
};

const selectStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  fontSize: '0.83rem',
  color: '#333',
  backgroundColor: '#fff',
  cursor: 'pointer',
  minWidth: '140px',
};

const cardsContainerStyle: React.CSSProperties = {
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
  padding: '0.5rem 0.75rem',
  backgroundColor: '#f4f5f7',
  borderBottom: '1px solid #dfe1e6',
};

const panelHeaderTextStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#42526e',
};

const panelBodyStyle: React.CSSProperties = {
  padding: '0.75rem',
};

const cardBodyStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
};

const cardLeftStyle: React.CSSProperties = {
  flex: '1 1 340px',
  minWidth: 0,
};

const cardRightStyle: React.CSSProperties = {
  flex: '0 0 220px',
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

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '3rem 1rem',
  color: '#999',
};
