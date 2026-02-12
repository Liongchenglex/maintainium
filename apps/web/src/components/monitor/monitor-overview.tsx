'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, post, patch, ApiError } from '@/lib/api';
import { Spinner } from '../ui/spinner';

// ── Types ──

interface ScanData {
  id: string;
  projectId: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  trigger: 'manual' | 'auto' | 'scheduled';
  scannersRun: string[] | null;
  totalFindings: number | null;
  newFindings: number | null;
  resolvedFindings: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

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

interface MonitorOverviewProps {
  projectId: string;
  productionUrl: string | null;
  onProductionUrlChange: (url: string | null) => void;
}

type StatusFilter = 'open' | 'resolved' | 'dismissed' | '';
type SeverityFilter = 'critical' | 'high' | 'medium' | 'low' | 'info' | '';

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

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
  high: { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
  medium: { bg: '#fffde7', text: '#f9a825', border: '#fff176' },
  low: { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
  info: { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
};

// ── Component ──

export function MonitorOverview({
  projectId,
  productionUrl,
  onProductionUrlChange,
}: MonitorOverviewProps) {
  const [scans, setScans] = useState<ScanData[]>([]);
  const [findings, setFindings] = useState<FindingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [urlInput, setUrlInput] = useState(productionUrl || '');
  const [savingUrl, setSavingUrl] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('');
  const [scannerFilter, setScannerFilter] = useState('');
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [scansData, findingsData] = await Promise.all([
        get<ScanData[]>(`/projects/${projectId}/scans`),
        get<FindingData[]>(
          `/projects/${projectId}/findings?${buildFindingQuery(statusFilter, severityFilter, scannerFilter)}`,
        ),
      ]);
      setScans(scansData);
      setFindings(findingsData);
      setError(null);

      // Sync scanning state with latest scan status
      const latest = scansData[0];
      if (latest?.status === 'scanning' || latest?.status === 'pending') {
        setScanning(true);
      } else {
        setScanning(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitor data');
    } finally {
      setLoading(false);
    }
  }, [projectId, statusFilter, severityFilter, scannerFilter]);

  // Check if analysis is completed
  useEffect(() => {
    const checkAnalysis = async () => {
      try {
        const data = await get<{ status: string }>(`/projects/${projectId}/analysis`);
        setAnalysisReady(data.status === 'completed');
      } catch {
        setAnalysisReady(false);
      }
    };
    checkAnalysis();
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while scan is in progress
  useEffect(() => {
    if (scanning) {
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [scanning, fetchData]);

  // Auto-refresh findings every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await post(`/projects/${projectId}/scan`);
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        await fetchData();
      } else {
        setScanning(false);
        setError(err instanceof Error ? err.message : 'Failed to start scan');
      }
    }
  };

  const handleSaveUrl = async () => {
    setSavingUrl(true);
    try {
      const url = urlInput.trim() || null;
      await patch(`/projects/${projectId}`, { productionUrl: url });
      onProductionUrlChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save URL');
    } finally {
      setSavingUrl(false);
    }
  };

  const handleDismiss = async (findingId: string) => {
    setDismissingId(findingId);
    try {
      await post(`/projects/${projectId}/findings/${findingId}/dismiss`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss finding');
    } finally {
      setDismissingId(null);
    }
  };

  // ── Severity summary ──

  const severityCounts = findings.reduce<Record<string, number>>(
    (acc, f) => {
      if (f.status === 'open') {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
      }
      return acc;
    },
    {},
  );

  // ── Group findings by scanner ──

  const groupedFindings = findings.reduce<Record<string, FindingData[]>>(
    (acc, f) => {
      const key = f.scanner;
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    },
    {},
  );

  const latestScan = scans[0] ?? null;

  // ── Render ──

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666' }}>
          <Spinner color="#666" size={14} />
          <span>Loading monitor data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#c62828' }}>{error}</p>
        <button onClick={fetchData} style={buttonStyle}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Production URL Section */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Production URL</h3>
        {productionUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://myapp.com"
              style={inputStyle}
            />
            <button
              onClick={handleSaveUrl}
              disabled={savingUrl || urlInput === productionUrl}
              style={buttonStyle}
            >
              {savingUrl ? 'Saving...' : 'Update'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
              Add your production URL to enable uptime and SSL monitoring.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://myapp.com"
                style={inputStyle}
              />
              <button
                onClick={handleSaveUrl}
                disabled={savingUrl || !urlInput.trim()}
                style={buttonStyle}
              >
                {savingUrl ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scan Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {latestScan && <ScanStatusBadge status={latestScan.status} />}
          {latestScan?.completedAt && (
            <span style={{ fontSize: '0.8rem', color: '#888' }}>
              Last scan: {new Date(latestScan.completedAt).toLocaleString()}
              {latestScan.durationMs && ` (${(latestScan.durationMs / 1000).toFixed(1)}s)`}
            </span>
          )}
        </div>
        <button
          onClick={handleScan}
          disabled={scanning || !analysisReady}
          style={{
            ...buttonStyle,
            opacity: !analysisReady && !scanning ? 0.5 : 1,
            cursor: !analysisReady && !scanning ? 'default' : 'pointer',
          }}
          title={!analysisReady ? 'Run a codebase analysis first' : undefined}
        >
          {scanning ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Spinner color="#333" size={12} /> Scanning...
            </span>
          ) : scans.length === 0 ? (
            'Run First Scan'
          ) : (
            'Re-scan'
          )}
        </button>
      </div>

      {/* Analysis not ready */}
      {!analysisReady && !scanning && (
        <div style={{ padding: '0.75rem', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '6px', marginBottom: '1rem' }}>
          <p style={{ color: '#e65100', fontSize: '0.85rem', margin: 0 }}>
            Run a codebase analysis first to enable scanning.
          </p>
        </div>
      )}

      {/* Scanning progress */}
      {scanning && (
        <div style={{ padding: '0.75rem', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb', borderRadius: '6px', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1565c0', fontSize: '0.85rem' }}>
            <Spinner color="#1565c0" size={12} />
            <span>Scan in progress... Results will appear shortly.</span>
          </div>
        </div>
      )}

      {/* Scan error */}
      {latestScan?.status === 'failed' && latestScan.errorMessage && (
        <div style={{ padding: '0.75rem', backgroundColor: '#fff3f3', border: '1px solid #ffcdd2', borderRadius: '6px', marginBottom: '1rem' }}>
          <p style={{ color: '#c62828', fontSize: '0.85rem', margin: 0 }}>
            Scan failed: {latestScan.errorMessage}
          </p>
        </div>
      )}

      {/* Empty state */}
      {scans.length === 0 && !scanning && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          <p>No scans have been run yet.</p>
          <p style={{ fontSize: '0.85rem' }}>
            Click &quot;Run First Scan&quot; to analyze your project for issues.
          </p>
        </div>
      )}

      {/* Severity summary bar */}
      {scans.length > 0 && !scanning && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {(['critical', 'high', 'medium', 'low', 'info'] as const).map((sev) => {
              const count = severityCounts[sev] || 0;
              const colors = SEVERITY_COLORS[sev];
              return (
                <span
                  key={sev}
                  style={{
                    ...chipStyle,
                    backgroundColor: colors.bg,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                    opacity: count === 0 ? 0.5 : 1,
                  }}
                >
                  {sev}: {count}
                </span>
              );
            })}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#666' }}>Filter:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              style={selectStyle}
            >
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="">All</option>
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              style={selectStyle}
            >
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
            <select
              value={scannerFilter}
              onChange={(e) => setScannerFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">All scanners</option>
              {Object.entries(SCANNER_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Findings grouped by scanner */}
          {findings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#666' }}>
              <p>No findings match the current filters.</p>
            </div>
          ) : (
            Object.entries(groupedFindings).map(([scanner, scannerFindings]) => (
              <div key={scanner} style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ ...sectionTitleStyle, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  {SCANNER_LABELS[scanner] || scanner}
                  <span style={{ fontWeight: 400, color: '#888', marginLeft: '0.5rem' }}>
                    ({scannerFindings.length})
                  </span>
                </h4>
                {scannerFindings.map((finding) => (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    onDismiss={handleDismiss}
                    dismissingId={dismissingId}
                  />
                ))}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-Components ──

function ScanStatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    pending: { backgroundColor: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80' },
    scanning: { backgroundColor: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9' },
    completed: { backgroundColor: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7' },
    failed: { backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a' },
  };

  return (
    <span
      style={{
        padding: '0.2rem 0.6rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        ...(styles[status] || {}),
      }}
    >
      {status}
    </span>
  );
}

function FindingRow({
  finding,
  onDismiss,
  dismissingId,
}: {
  finding: FindingData;
  onDismiss: (id: string) => void;
  dismissingId: string | null;
}) {
  const colors = SEVERITY_COLORS[finding.severity];

  return (
    <div
      style={{
        padding: '0.6rem 0.75rem',
        marginBottom: '0.4rem',
        borderRadius: '6px',
        border: '1px solid #e8e8e8',
        backgroundColor: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '0.75rem',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span
            style={{
              ...chipStyle,
              backgroundColor: colors.bg,
              color: colors.text,
              border: `1px solid ${colors.border}`,
              marginRight: 0,
              marginBottom: 0,
            }}
          >
            {finding.severity}
          </span>
          {finding.status !== 'open' && (
            <span
              style={{
                ...chipStyle,
                backgroundColor: finding.status === 'resolved' ? '#e8f5e9' : '#f5f5f5',
                color: finding.status === 'resolved' ? '#2e7d32' : '#666',
                border: `1px solid ${finding.status === 'resolved' ? '#a5d6a7' : '#e0e0e0'}`,
                marginRight: 0,
                marginBottom: 0,
              }}
            >
              {finding.status}
            </span>
          )}
          <strong style={{ fontSize: '0.85rem' }}>{finding.title}</strong>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#555', margin: '0.2rem 0', lineHeight: 1.4 }}>
          {finding.description}
        </p>
        <span style={{ fontSize: '0.7rem', color: '#999' }}>
          First seen: {new Date(finding.firstSeenAt).toLocaleDateString()}
        </span>
      </div>
      {finding.status === 'open' && (
        <button
          onClick={() => onDismiss(finding.id)}
          disabled={dismissingId === finding.id}
          style={{
            ...buttonStyle,
            fontSize: '0.75rem',
            padding: '0.25rem 0.6rem',
            flexShrink: 0,
          }}
        >
          {dismissingId === finding.id ? '...' : 'Dismiss'}
        </button>
      )}
    </div>
  );
}

// ── Helpers ──

function buildFindingQuery(status: string, severity: string, scanner: string): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (severity) params.set('severity', severity);
  if (scanner) params.set('scanner', scanner);
  return params.toString();
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '1.5rem',
  backgroundColor: '#fafafa',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '1.5rem',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 600,
  marginBottom: '0.75rem',
  color: '#333',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.2rem 0.6rem',
  borderRadius: '12px',
  fontSize: '0.75rem',
  fontWeight: 500,
  marginRight: '0.4rem',
  marginBottom: '0.3rem',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.4rem 1rem',
  borderRadius: '6px',
  border: '1px solid #d0d0d0',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#333',
};

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  borderRadius: '6px',
  border: '1px solid #d0d0d0',
  fontSize: '0.85rem',
  flex: 1,
  minWidth: '200px',
};

const selectStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  borderRadius: '6px',
  border: '1px solid #d0d0d0',
  fontSize: '0.8rem',
  backgroundColor: '#fff',
};
