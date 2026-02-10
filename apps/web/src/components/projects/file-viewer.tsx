'use client';

import { useState, useEffect } from 'react';
import { get, ApiError } from '@/lib/api';

interface FileData {
  name: string;
  path: string;
  size: number;
  content: string;
  truncated: boolean;
  binary: boolean;
}

interface FileViewerProps {
  projectId: string;
  path: string;
  onTokenExpired?: () => void;
}

export function FileViewer({ projectId, path, onTokenExpired }: FileViewerProps) {
  const [file, setFile] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await get<FileData>(
          `/projects/${projectId}/file?path=${encodeURIComponent(path)}`,
        );
        setFile(data);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'GITHUB_TOKEN_EXPIRED') {
          onTokenExpired?.();
        }
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };
    fetchFile();
  }, [projectId, path]);

  const containerStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    backgroundColor: '#f6f8fa',
    borderBottom: '1px solid #e0e0e0',
    fontSize: '0.85rem',
    color: '#666',
  };

  const contentStyle: React.CSSProperties = {
    padding: '1rem',
    overflow: 'auto',
    maxHeight: '70vh',
    backgroundColor: '#fafafa',
  };

  const preStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', monospace",
    fontSize: '0.85rem',
    lineHeight: 1.5,
    whiteSpace: 'pre',
    tabSize: 4,
  };

  const noticeStyle: React.CSSProperties = {
    padding: '1rem',
    textAlign: 'center',
    color: '#666',
    fontSize: '0.9rem',
  };

  if (loading) {
    return <div style={noticeStyle}>Loading file...</div>;
  }

  if (error) {
    return (
      <div style={{ ...noticeStyle, color: '#c62828' }}>{error}</div>
    );
  }

  if (!file) return null;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        {file.name} ({formatSize(file.size)})
      </div>
      {file.binary ? (
        <div style={noticeStyle}>
          Binary file cannot be displayed.
        </div>
      ) : (
        <div style={contentStyle}>
          <pre style={preStyle}>{file.content}</pre>
          {file.truncated && (
            <div
              style={{
                padding: '0.75rem',
                textAlign: 'center',
                color: '#e65100',
                borderTop: '1px solid #e0e0e0',
                fontSize: '0.85rem',
              }}
            >
              File truncated — only first 1MB shown.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
