'use client';

import { useAuth } from '@/contexts/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface GitHubReconnectPromptProps {
  message?: string;
}

export function GitHubReconnectPrompt({
  message = 'Your GitHub connection has expired. Please reconnect to continue.',
}: GitHubReconnectPromptProps) {
  const { dbUser } = useAuth();

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

  const handleReconnect = () => {
    if (dbUser?.authProvider === 'email') {
      window.location.href = `${API_URL}/github/oauth/initiate`;
    }
  };

  return (
    <div style={containerStyle}>
      <p style={messageStyle}>{message}</p>
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
