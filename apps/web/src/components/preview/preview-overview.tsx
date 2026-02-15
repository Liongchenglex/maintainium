'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { get, post, patch } from '@/lib/api';
import { Spinner } from '../ui/spinner';
import { DiffView } from '../monitor/diff-view';

// ── Types ──

interface PreviewChange {
  id: string;
  projectId: string;
  currentUrl: string;
  elementText: string;
  cssSelector: string | null;
  tagName: string;
  requestedChange: string;
  status: 'pending' | 'ready' | 'applied' | 'dismissed' | 'failed';
  targetFilePath: string | null;
  diff: DiffBlock[] | null;
  changeSummary: string | null;
  branchName: string | null;
  prUrl: string | null;
  prNumber: number | null;
  errorMessage: string | null;
  createdAt: string;
}

interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffBlock {
  filePath: string;
  language: string;
  hunks: DiffHunk[];
}

interface PreviewOverviewProps {
  projectId: string;
  previewUrl: string | null;
  previewApiKey: string | null;
  onPreviewSetup: (url: string, key: string) => void;
}

// ── Status Colors ──

const STATUS_COLORS: Record<PreviewChange['status'], { bg: string; text: string; border: string }> = {
  pending: { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
  ready: { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
  applied: { bg: '#f3e8ff', text: '#7c3aed', border: '#d8b4fe' },
  dismissed: { bg: '#f5f5f5', text: '#616161', border: '#e0e0e0' },
  failed: { bg: '#ffebee', text: '#c62828', border: '#ef9a9a' },
};

// ── Component ──

export function PreviewOverview({
  projectId,
  previewUrl,
  previewApiKey,
  onPreviewSetup,
}: PreviewOverviewProps) {
  const [changes, setChanges] = useState<PreviewChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchChanges = useCallback(async () => {
    try {
      const data = await get<PreviewChange[]>(
        `/projects/${projectId}/preview/changes`,
      );
      setChanges(data);
      return data;
    } catch {
      setChanges([]);
      return [];
    }
  }, [projectId]);

  // Load changes when preview is configured
  useEffect(() => {
    if (!previewUrl) return;
    const load = async () => {
      setLoading(true);
      await fetchChanges();
      setLoading(false);
    };
    load();
  }, [previewUrl, fetchChanges]);

  // Poll while any change is pending
  useEffect(() => {
    const hasPending = changes.some((c) => c.status === 'pending');

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(() => {
        fetchChanges();
      }, 3000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [changes, fetchChanges]);

  const handleSetup = async () => {
    setSetupError(null);
    if (!setupUrl.startsWith('https://')) {
      setSetupError('URL must start with https://');
      return;
    }

    setSetupLoading(true);
    try {
      const result = await patch<{ previewUrl: string; previewApiKey: string }>(
        `/projects/${projectId}/preview/setup`,
        { previewUrl: setupUrl },
      );
      onPreviewSetup(result.previewUrl, result.previewApiKey);
    } catch (err) {
      setSetupError(
        err instanceof Error ? err.message : 'Failed to enable preview',
      );
    } finally {
      setSetupLoading(false);
    }
  };

  const handleRegenerateKey = async () => {
    try {
      const result = await post<{ previewApiKey: string }>(
        `/projects/${projectId}/preview/setup/regenerate-key`,
      );
      onPreviewSetup(previewUrl!, result.previewApiKey);
    } catch {
      // silent
    }
  };

  const handleApply = async (changeId: string) => {
    setApplyingId(changeId);
    try {
      await post<PreviewChange>(
        `/projects/${projectId}/preview/changes/${changeId}/apply`,
      );
      await fetchChanges();
    } catch {
      // Error shown via status update
      await fetchChanges();
    } finally {
      setApplyingId(null);
    }
  };

  const handleDismiss = async (changeId: string) => {
    try {
      await patch(
        `/projects/${projectId}/preview/changes/${changeId}/dismiss`,
      );
      await fetchChanges();
    } catch {
      // silent
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Setup View ──
  if (!previewUrl) {
    return (
      <div>
        <h2 style={titleStyle}>Visual Preview</h2>
        <div style={setupCardStyle}>
          <p style={setupDescStyle}>
            Enable Visual Preview to let users annotate your deployed site and
            submit change requests directly from the browser.
          </p>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Production URL (HTTPS)</label>
            <input
              type="url"
              value={setupUrl}
              onChange={(e) => setSetupUrl(e.target.value)}
              placeholder="https://your-app.com"
              style={inputStyle}
            />
          </div>
          {setupError && (
            <p style={{ color: '#c62828', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
              {setupError}
            </p>
          )}
          <button
            onClick={handleSetup}
            disabled={setupLoading || !setupUrl}
            style={{
              ...primaryBtnStyle,
              opacity: setupLoading || !setupUrl ? 0.6 : 1,
            }}
          >
            {setupLoading ? 'Enabling...' : 'Enable Preview'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main View ──
  const scriptTag = `<script src="${apiBase}/preview/overlay.js" data-project="${projectId}" data-key="${previewApiKey}" data-api="${apiBase}"></script>`;

  const bookmarkletUrl = `javascript:void((function(){var s=document.createElement('script');s.src='${apiBase}/preview/overlay.js';s.setAttribute('data-project','${projectId}');s.setAttribute('data-key','${previewApiKey}');s.setAttribute('data-api','${apiBase}');document.body.appendChild(s)})())`;

  // Set bookmarklet href via DOM to bypass React's javascript: URL blocking
  useEffect(() => {
    if (bookmarkletRef.current) {
      bookmarkletRef.current.href = bookmarkletUrl;
    }
  }, [bookmarkletUrl]);

  return (
    <div>
      {/* Header */}
      <div style={headerRowStyle}>
        <h2 style={titleStyle}>Visual Preview</h2>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={openBtnStyle}
        >
          Open Preview
        </a>
      </div>

      {/* Setup Info */}
      <div style={infoCardStyle}>
        {/* Bookmarklet (primary) */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Bookmarklet</label>
          <p style={{ fontSize: '0.83rem', color: '#555', margin: '0 0 0.5rem 0', lineHeight: 1.5 }}>
            Drag the button below to your bookmarks bar, then click it on any page of your site.
          </p>
          <a
            ref={bookmarkletRef}
            onClick={(e) => e.preventDefault()}
            draggable
            style={bookmarkletPillStyle}
          >
            Maintanium Preview
          </a>
        </div>

        {/* Advanced: Script Tag (collapsible) */}
        <div style={{ marginBottom: '1rem' }}>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={toggleBtnStyle}
          >
            <span style={{ fontSize: '0.75rem', marginRight: '0.35rem' }}>
              {showAdvanced ? '\u25BC' : '\u25B6'}
            </span>
            Advanced: Manual Script Tag
          </button>
          {showAdvanced && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={codeBlockStyle}>
                <code style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
                  {scriptTag}
                </code>
              </div>
              <button
                onClick={() => copyToClipboard(scriptTag, 'script')}
                style={copyBtnStyle}
              >
                {copiedField === 'script' ? 'Copied!' : 'Copy Script Tag'}
              </button>
            </div>
          )}
        </div>

        {/* API Key */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>API Key:</label>
          <code style={{ fontSize: '0.82rem', color: '#333' }}>
            {showApiKey
              ? previewApiKey
              : previewApiKey
                ? previewApiKey.slice(0, 8) + '...'
                : ''}
          </code>
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            style={linkBtnStyle}
          >
            {showApiKey ? 'Hide' : 'Show'}
          </button>
          <button onClick={handleRegenerateKey} style={linkBtnStyle}>
            Regenerate
          </button>
        </div>
      </div>

      {/* Change History */}
      {loading ? (
        <div style={loadingStyle}>
          <Spinner color="#666" size={14} />
          <span>Loading changes...</span>
        </div>
      ) : changes.length === 0 ? (
        <div style={emptyStyle}>
          <p style={{ fontSize: '0.95rem', fontWeight: 500, color: '#555', marginBottom: '0.3rem' }}>
            No changes yet
          </p>
          <p style={{ fontSize: '0.83rem', color: '#999', margin: 0 }}>
            Use the bookmarklet or add the script tag to your site, then use
            the Annotate tool to capture elements and request changes.
          </p>
        </div>
      ) : (
        <div style={cardsContainerStyle}>
          {changes.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              isApplying={applyingId === change.id}
              onApply={() => handleApply(change.id)}
              onDismiss={() => handleDismiss(change.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Change Card ──

function ChangeCard({
  change,
  isApplying,
  onApply,
  onDismiss,
}: {
  change: PreviewChange;
  isApplying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const statusColors = STATUS_COLORS[change.status];

  return (
    <div style={cardStyle}>
      {/* Card Header */}
      <div style={cardHeaderStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#333' }}>
              &lt;{change.tagName}&gt;
            </span>
            <span
              style={{
                ...chipStyle,
                backgroundColor: statusColors.bg,
                color: statusColors.text,
                border: `1px solid ${statusColors.border}`,
              }}
            >
              {change.status}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#666', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            &ldquo;{change.elementText.length > 80
              ? change.elementText.slice(0, 80) + '...'
              : change.elementText}&rdquo;
          </p>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#999', whiteSpace: 'nowrap' }}>
          {new Date(change.createdAt).toLocaleDateString()}
        </span>
      </div>

      {/* Card Body */}
      <div style={cardBodyStyle}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={detailLabelStyle}>Requested Change</span>
          <p style={detailValueStyle}>{change.requestedChange}</p>
        </div>

        {change.targetFilePath && (
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={detailLabelStyle}>Target File</span>
            <code style={{ fontSize: '0.82rem', color: '#1565c0' }}>
              {change.targetFilePath}
            </code>
          </div>
        )}

        {change.changeSummary && (
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={detailLabelStyle}>AI Summary</span>
            <p style={detailValueStyle}>{change.changeSummary}</p>
          </div>
        )}

        {/* Pending state */}
        {change.status === 'pending' && (
          <div style={processingStyle}>
            <Spinner color="#1565c0" size={14} />
            <span>AI is processing this change...</span>
          </div>
        )}

        {/* Ready state — show diff + actions */}
        {change.status === 'ready' && change.diff && (
          <>
            <div style={{ marginTop: '0.5rem' }}>
              <DiffView changes={change.diff} />
            </div>
            <div style={actionsStyle}>
              <button
                onClick={onApply}
                disabled={isApplying}
                style={{
                  ...primaryBtnStyle,
                  opacity: isApplying ? 0.6 : 1,
                }}
              >
                {isApplying ? 'Applying...' : 'Apply (Create PR)'}
              </button>
              <button onClick={onDismiss} style={secondaryBtnStyle}>
                Dismiss
              </button>
            </div>
          </>
        )}

        {/* Applied state — show PR link */}
        {change.status === 'applied' && change.prUrl && (
          <div style={prLinkStyle}>
            <a
              href={change.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1565c0', fontSize: '0.85rem', fontWeight: 600 }}
            >
              View PR #{change.prNumber}
            </a>
            {change.branchName && (
              <span style={{ fontSize: '0.78rem', color: '#888' }}>
                Branch: {change.branchName}
              </span>
            )}
          </div>
        )}

        {/* Failed state — show error */}
        {change.status === 'failed' && change.errorMessage && (
          <div style={errorStyle}>
            {change.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ──

const titleStyle: React.CSSProperties = {
  fontSize: '1.1rem',
  fontWeight: 600,
  color: '#1a1a1a',
  margin: 0,
};

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.75rem',
};

const setupCardStyle: React.CSSProperties = {
  padding: '1.5rem',
  border: '1px solid #dfe1e6',
  borderRadius: '4px',
  backgroundColor: '#fff',
};

const setupDescStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#555',
  lineHeight: 1.5,
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#6b778c',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: '0.3rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  fontSize: '0.85rem',
  color: '#333',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  borderRadius: '4px',
  border: '1px solid #1565c0',
  backgroundColor: '#1565c0',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 600,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  backgroundColor: '#fff',
  color: '#333',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 500,
};

const openBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.85rem',
  borderRadius: '4px',
  border: '1px solid #1565c0',
  backgroundColor: '#1565c0',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#1565c0',
  cursor: 'pointer',
  fontSize: '0.78rem',
  fontWeight: 500,
  padding: 0,
  textDecoration: 'underline',
};

const copyBtnStyle: React.CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.3rem 0.65rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  backgroundColor: '#f5f5f5',
  color: '#333',
  cursor: 'pointer',
  fontSize: '0.78rem',
  fontWeight: 500,
};

const infoCardStyle: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid #dfe1e6',
  borderRadius: '4px',
  backgroundColor: '#fff',
  marginBottom: '1rem',
};

const codeBlockStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  backgroundColor: '#f4f5f7',
  borderRadius: '4px',
  border: '1px solid #e0e0e0',
  overflowX: 'auto',
};

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  color: '#666',
  padding: '3rem',
  justifyContent: 'center',
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '3rem 1rem',
  color: '#999',
};

const cardsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #dfe1e6',
  borderRadius: '4px',
  backgroundColor: '#fff',
  overflow: 'hidden',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '0.6rem 0.75rem',
  backgroundColor: '#f4f5f7',
  borderBottom: '1px solid #dfe1e6',
  gap: '0.5rem',
};

const cardBodyStyle: React.CSSProperties = {
  padding: '0.75rem',
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

const processingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  color: '#1565c0',
  fontSize: '0.82rem',
  padding: '0.5rem 0',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginTop: '0.75rem',
};

const prLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.5rem 0.75rem',
  backgroundColor: '#f3e8ff',
  borderRadius: '4px',
  marginTop: '0.5rem',
};

const errorStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  backgroundColor: '#ffebee',
  borderRadius: '4px',
  color: '#c62828',
  fontSize: '0.82rem',
  marginTop: '0.5rem',
};

const bookmarkletPillStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.5rem 1rem',
  borderRadius: '20px',
  backgroundColor: '#1565c0',
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'grab',
  userSelect: 'none',
  border: '2px dashed #90caf9',
};

const toggleBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6b778c',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 600,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};
