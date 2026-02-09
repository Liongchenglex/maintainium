'use client';

interface BreadcrumbNavProps {
  path: string;
  onNavigate: (path: string) => void;
  repoName: string;
}

export function BreadcrumbNav({ path, onNavigate, repoName }: BreadcrumbNavProps) {
  const parts = path ? path.split('/') : [];

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.9rem',
    flexWrap: 'wrap',
  };

  const linkStyle: React.CSSProperties = {
    color: '#1565c0',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '0.9rem',
    textDecoration: 'none',
  };

  const separatorStyle: React.CSSProperties = {
    color: '#999',
  };

  const currentStyle: React.CSSProperties = {
    fontWeight: 600,
    color: '#333',
  };

  return (
    <nav style={containerStyle}>
      <button
        onClick={() => onNavigate('')}
        style={linkStyle}
      >
        {repoName}
      </button>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const pathUpTo = parts.slice(0, i + 1).join('/');
        return (
          <span key={pathUpTo} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={separatorStyle}>/</span>
            {isLast ? (
              <span style={currentStyle}>{part}</span>
            ) : (
              <button
                onClick={() => onNavigate(pathUpTo)}
                style={linkStyle}
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
