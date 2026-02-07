'use client';

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, dbUser, loading, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid #e0e0e0',
  };

  const userInfoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  };

  const signOutButtonStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    background: 'transparent',
    fontSize: '0.9rem',
    cursor: 'pointer',
  };

  return (
    <div>
      <header style={headerStyle}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>MaintainAI</h2>
        <div style={userInfoStyle}>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>
            {dbUser?.displayName || user.email}
          </span>
          <button onClick={handleSignOut} style={signOutButtonStyle}>
            Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
