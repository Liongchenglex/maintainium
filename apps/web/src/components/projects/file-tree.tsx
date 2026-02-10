'use client';

import { useState, useEffect, useCallback } from 'react';
import { get, ApiError } from '@/lib/api';

interface TreeEntry {
  name: string;
  type: 'directory' | 'file';
  sha: string;
  size: number | null;
}

interface FileTreeProps {
  projectId: string;
  path: string;
  onNavigate: (path: string, type: 'directory' | 'file') => void;
  onTokenExpired?: () => void;
}

export function FileTree({ projectId, path, onNavigate, onTokenExpired }: FileTreeProps) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const data = await get<TreeEntry[]>(
        `/projects/${projectId}/tree${params}`,
      );
      setEntries(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'GITHUB_TOKEN_EXPIRED') {
        onTokenExpired?.();
      }
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [projectId, path]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const containerStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
    fontSize: '0.9rem',
    gap: '0.5rem',
  };

  const iconStyle: React.CSSProperties = {
    width: '16px',
    textAlign: 'center',
    flexShrink: 0,
    color: '#666',
  };

  const nameStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        Loading directory...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#c62828' }}>
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        Empty directory.
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {entries.map((entry) => {
        const fullPath = path ? `${path}/${entry.name}` : entry.name;
        return (
          <div
            key={entry.sha}
            style={rowStyle}
            onClick={() => onNavigate(fullPath, entry.type)}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f8f9fa';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = '';
            }}
          >
            <span style={iconStyle}>
              {entry.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}'}
            </span>
            <span
              style={{
                ...nameStyle,
                fontWeight: entry.type === 'directory' ? 600 : 400,
                color: entry.type === 'directory' ? '#1565c0' : '#333',
              }}
            >
              {entry.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
