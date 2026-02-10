'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { get } from '@/lib/api';

interface GitHubReconnectPromptProps {
  message?: string;
}

export function GitHubReconnectPrompt({
  message = 'Your GitHub connection has expired. Please reconnect to continue.',
}: GitHubReconnectPromptProps) {
  const { dbUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const containerStyle: React.CSSProperties = {
    padding: '1.5rem',
    borderRadius: '8px',
    border: '1px solid #ffcc80',
    backgroundColor: '#fff3e0',
    textAlign: 'center',
    maxWidth: '500px',
    margin: '2rem auto',
  };

  const messageStyle: React.CSSProperties = {
    color: '#e65100',
    marginBottom: '1rem',
    fontSize: '0.95rem',
  };

  const btnStyle: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    border: '1px solid #e65100',
    background: '#e65100',
    color: '#fff',
    fontSize: '0.9rem',
    cursor: 'pointer',
    textDecoration: 'none',
  };

  const handleReconnect = async () => {
    try {
      const { url } = await get<{ url: string }>('/github/oauth/initiate');
      window.location.href = url;
    } catch {
      setError('Failed to start GitHub reconnection. Please try again.');
    }
  };

  return (
    <div style={containerStyle}>
      <p style={messageStyle}>{message}</p>
      {error && (
        <p style={{ color: '#c62828', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>
      )}
      {dbUser?.authProvider === 'github' ? (
        <p style={{ color: '#666', fontSize: '0.85rem' }}>
          Please sign out and sign in with GitHub again to refresh your token.
        </p>
      ) : (
        <button onClick={handleReconnect} style={btnStyle}>
          Reconnect GitHub
        </button>
      )}
    </div>
  );
}
