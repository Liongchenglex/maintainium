'use client';

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

interface DiffViewProps {
  changes: DiffBlock[];
}

export function DiffView({ changes }: DiffViewProps) {
  if (changes.length === 0) {
    return (
      <div style={emptyStyle}>
        No code changes — this is an infrastructure-level finding.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {changes.map((block, blockIdx) => (
        <div key={blockIdx} style={blockStyle}>
          <div style={fileHeaderStyle}>{block.filePath}</div>
          {block.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div style={hunkHeaderStyle}>{hunk.header}</div>
              {hunk.lines.map((line, lineIdx) => (
                <div key={lineIdx} style={getLineStyle(line.type)}>
                  <span style={prefixStyle}>{LINE_PREFIXES[line.type]}</span>
                  {line.content}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Helpers ──

const LINE_PREFIXES: Record<DiffLine['type'], string> = {
  context: ' ',
  add: '+',
  remove: '-',
};

const LINE_COLORS: Record<DiffLine['type'], { bg: string; color: string }> = {
  context: { bg: 'transparent', color: '#333' },
  add: { bg: '#e6ffec', color: '#1a7f37' },
  remove: { bg: '#ffebe9', color: '#cf222e' },
};

function getLineStyle(type: DiffLine['type']): React.CSSProperties {
  const colors = LINE_COLORS[type];
  return {
    fontFamily: 'monospace',
    fontSize: '0.82rem',
    lineHeight: '1.6',
    padding: '0 0.75rem',
    backgroundColor: colors.bg,
    color: colors.color,
    whiteSpace: 'pre',
    overflow: 'auto',
  };
}

// ── Styles ──

const blockStyle: React.CSSProperties = {
  border: '1px solid #d0d7de',
  borderRadius: '6px',
  overflow: 'hidden',
};

const fileHeaderStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  backgroundColor: '#2d333b',
  color: '#adbac7',
  fontFamily: 'monospace',
  fontSize: '0.82rem',
  fontWeight: 600,
};

const hunkHeaderStyle: React.CSSProperties = {
  padding: '0.25rem 0.75rem',
  backgroundColor: '#f0f6ff',
  color: '#57606a',
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  borderTop: '1px solid #d0d7de',
};

const prefixStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '1.2rem',
  userSelect: 'none',
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  padding: '1.5rem',
  textAlign: 'center',
  color: '#666',
  backgroundColor: '#f9f9f9',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
  fontSize: '0.85rem',
};
