'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { get } from '@/lib/api';
import { Spinner } from '../ui/spinner';
import { DiffView } from './diff-view';
import { generateMockInvestigation, type InvestigationData } from './investigation-mock';

// ── Types ──

interface FindingData {
  id: string;
  projectId: string;
  scanId: string;
  scanner: string;
  fingerprint: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  details: Record<string, unknown> | null;
  status: 'open' | 'resolved' | 'dismissed';
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
  high: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  medium: { bg: '#fffde7', text: '#f9a825', border: '#fff176' },
  low: { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
  info: { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
};

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  high: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
  medium: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  low: { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
};

const SCANNER_LABELS: Record<string, string> = {
  's1-cve': 'Dependency CVEs',
  's2-freshness': 'Dependency Freshness',
  's3-secrets': 'Hardcoded Secrets',
  's4-auth-coverage': 'Auth Coverage',
  's5-code-health': 'Code Health',
  's6-env-exposure': 'Env Exposure',
  's7-uptime': 'Uptime',
  's7a-ssl': 'SSL/TLS',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#e3f2fd', text: '#1565c0' },
  resolved: { bg: '#e8f5e9', text: '#2e7d32' },
  dismissed: { bg: '#f5f5f5', text: '#666' },
};

// ── Component ──

export function InvestigationDetail() {
  const params = useParams();
  const projectId = params.id as string;
  const findingId = params.findingId as string;

  const [finding, setFinding] = useState<FindingData | null>(null);
  const [investigation, setInvestigation] = useState<InvestigationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFinding = async () => {
      try {
        const findings = await get<FindingData[]>(
          `/projects/${projectId}/findings`,
        );
        const match = findings.find((f) => f.id === findingId);
        if (!match) {
          setError('Finding not found');
          return;
        }
        setFinding(match);
        setInvestigation(generateMockInvestigation(match));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load finding');
      } finally {
        setLoading(false);
      }
    };
    fetchFinding();
  }, [projectId, findingId]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', padding: '3rem', justifyContent: 'center' }}>
          <Spinner color="#666" size={14} />
          <span>Generating investigation report...</span>
        </div>
      </div>
    );
  }

  if (error || !finding || !investigation) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#c62828', padding: '2rem' }}>{error || 'Investigation could not be generated'}</p>
        <Link href={`/dashboard/projects/${projectId}?tab=monitor`} style={backLinkStyle}>
          Back to Monitor
        </Link>
      </div>
    );
  }

  const sevColors = SEVERITY_COLORS[finding.severity];
  const confColors = CONFIDENCE_COLORS[investigation.diagnosis.confidence];
  const statusColors = STATUS_COLORS[finding.status] ?? STATUS_COLORS.open;
  const hasChanges = investigation.changes.length > 0;

  return (
    <div style={pageStyle}>
      {/* ── Top Breadcrumb Bar ── */}
      <div style={breadcrumbBarStyle}>
        <Link href={`/dashboard/projects/${projectId}?tab=monitor`} style={backLinkStyle}>
          Monitor
        </Link>
        <span style={{ color: '#999', margin: '0 0.4rem' }}>/</span>
        <span style={{ fontSize: '0.82rem', color: '#555' }}>Investigation</span>
      </div>

      {/* ── Header Strip ── */}
      <div style={headerStripStyle}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ ...chipStyle, backgroundColor: sevColors.bg, color: sevColors.text, border: `1px solid ${sevColors.border}` }}>
              {finding.severity}
            </span>
            <span style={{ ...chipStyle, backgroundColor: statusColors.bg, color: statusColors.text, border: `1px solid ${statusColors.bg}` }}>
              {finding.status}
            </span>
            <span style={{ ...chipStyle, backgroundColor: '#f3e8ff', color: '#7c3aed', border: '1px solid #d8b4fe' }}>
              {SCANNER_LABELS[finding.scanner] || finding.scanner}
            </span>
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: '#1a1a1a' }}>
            {finding.title}
          </h1>
        </div>

        {/* Apply Changes CTA */}
        {hasChanges && (
          <button
            onClick={() => {/* B4: future — create PR */}}
            style={applyButtonStyle}
            title="Creates a branch and PR with these changes (coming soon)"
          >
            Apply Changes
          </button>
        )}
      </div>

      {/* ── Two-Column Body ── */}
      <div style={bodyStyle}>
        {/* ── Main Column (left) ── */}
        <div style={mainColumnStyle}>
          {/* Diagnosis Panel */}
          <Panel title="Diagnosis">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={detailLabelStyle}>Confidence</span>
              <span style={{ ...chipStyle, backgroundColor: confColors.bg, color: confColors.text, border: `1px solid ${confColors.border}` }}>
                {investigation.diagnosis.confidence}
              </span>
            </div>
            <DetailRow label="Summary" value={investigation.diagnosis.summary} />
            <DetailRow label="Root Cause" value={investigation.diagnosis.rootCause} />
            <DetailRow label="Impact" value={investigation.diagnosis.impact} last />
          </Panel>

          {/* Proposed Implementation Panel */}
          <Panel title="Proposed Implementation">
            <DetailRow label="Strategy" value={investigation.proposal.strategy} />
            <DetailRow label="Estimated Effort" value={investigation.proposal.estimatedEffort} last={investigation.proposal.files.length === 0} />
            {investigation.proposal.files.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <span style={detailLabelStyle}>Files to Change</span>
                <div style={{ marginTop: '0.3rem' }}>
                  {investigation.proposal.files.map((f, i) => (
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

          {/* Changes Panel */}
          <Panel
            title="Changes"
            headerRight={
              hasChanges ? (
                <button
                  onClick={() => {/* B4: future — create PR */}}
                  style={applyButtonSmallStyle}
                  title="Creates a branch and PR with these changes (coming soon)"
                >
                  Apply Changes
                </button>
              ) : undefined
            }
          >
            <DiffView changes={investigation.changes} />
          </Panel>

          {/* Test Scope Panel */}
          <Panel title="Test Scope">
            {investigation.testScope.map((group, i) => (
              <div key={i} style={{ marginBottom: i < investigation.testScope.length - 1 ? '0.6rem' : 0 }}>
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
        </div>

        {/* ── Sidebar Column (right) ── */}
        <div style={sidebarColumnStyle}>
          {/* Details Panel */}
          <Panel title="Details">
            <SidebarRow label="Status">
              <span style={{ ...chipStyle, backgroundColor: statusColors.bg, color: statusColors.text, border: `1px solid ${statusColors.bg}`, fontSize: '0.72rem' }}>
                {finding.status}
              </span>
            </SidebarRow>
            <SidebarRow label="Severity">
              <span style={{ ...chipStyle, backgroundColor: sevColors.bg, color: sevColors.text, border: `1px solid ${sevColors.border}`, fontSize: '0.72rem' }}>
                {finding.severity}
              </span>
            </SidebarRow>
            <SidebarRow label="Confidence">
              <span style={{ ...chipStyle, backgroundColor: confColors.bg, color: confColors.text, border: `1px solid ${confColors.border}`, fontSize: '0.72rem' }}>
                {investigation.diagnosis.confidence}
              </span>
            </SidebarRow>
            <SidebarRow label="Scanner">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {SCANNER_LABELS[finding.scanner] || finding.scanner}
              </span>
            </SidebarRow>
            <SidebarRow label="Effort">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {investigation.proposal.estimatedEffort}
              </span>
            </SidebarRow>
            <SidebarRow label="First Seen">
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {new Date(finding.firstSeenAt).toLocaleDateString()}
              </span>
            </SidebarRow>
            <SidebarRow label="Last Seen" last>
              <span style={{ fontSize: '0.82rem', color: '#333' }}>
                {new Date(finding.lastSeenAt).toLocaleDateString()}
              </span>
            </SidebarRow>
          </Panel>

          {/* Description Panel */}
          <Panel title="Description">
            <p style={{ fontSize: '0.83rem', color: '#444', lineHeight: 1.5, margin: 0 }}>
              {finding.description}
            </p>
          </Panel>

          {/* Files Panel */}
          {investigation.proposal.files.length > 0 && (
            <Panel title={`Files (${investigation.proposal.files.length})`}>
              {investigation.proposal.files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0', borderBottom: i < investigation.proposal.files.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <span style={actionBadgeStyle(f.action)}>{f.action}</span>
                  <code style={{ fontSize: '0.78rem', color: '#333', wordBreak: 'break-all' }}>{f.path}</code>
                </div>
              ))}
            </Panel>
          )}

          {/* Preview Panel */}
          <Panel title="Preview">
            <div style={{ textAlign: 'center', padding: '1rem 0', color: '#bbb' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: '0.3rem', color: '#aaa' }}>
                Coming Soon
              </div>
              <p style={{ fontSize: '0.78rem', color: '#ccc', margin: 0 }}>
                Live preview of proposed changes
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── Sub-Components ──

function Panel({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelHeaderTextStyle}>{title}</span>
        {headerRight}
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

const applyButtonStyle: React.CSSProperties = {
  padding: '0.5rem 1.25rem',
  borderRadius: '6px',
  border: '1px solid #7c3aed',
  backgroundColor: '#7c3aed',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const applyButtonSmallStyle: React.CSSProperties = {
  padding: '0.25rem 0.75rem',
  borderRadius: '4px',
  border: '1px solid #d8b4fe',
  backgroundColor: '#f3e8ff',
  color: '#7c3aed',
  cursor: 'pointer',
  fontSize: '0.75rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
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
