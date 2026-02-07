'use client';

import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  info: Record<string, unknown>;
  error: Record<string, unknown>;
  details: Record<string, unknown>;
}

export function HealthStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:4000/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: HealthResponse) => {
        setHealth(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
        setHealth(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const containerStyle: React.CSSProperties = {
    padding: '1.5rem 2rem',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    minWidth: '300px',
    textAlign: 'center',
  };

  if (loading) {
    return <div style={containerStyle}>Checking API health...</div>;
  }

  if (error) {
    return (
      <div style={{ ...containerStyle, borderColor: '#e53e3e', color: '#e53e3e' }}>
        <strong>API Unreachable</strong>
        <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, borderColor: '#38a169', color: '#38a169' }}>
      <strong>API Status: {health?.status}</strong>
    </div>
  );
}
