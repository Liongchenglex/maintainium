'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getFirebaseErrorMessage } from '@/lib/firebase-errors';
import { FirebaseError } from 'firebase/app';

export function LoginForm() {
  const router = useRouter();
  const { signIn, signInWithGithub } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(getFirebaseErrorMessage(err.code));
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGithub() {
    setError(null);
    setLoading(true);

    try {
      await signInWithGithub();
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(getFirebaseErrorMessage(err.code));
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '2rem',
  };

  const formStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    width: '100%',
    maxWidth: '400px',
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '1rem',
    width: '100%',
    boxSizing: 'border-box',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    border: 'none',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: '#171717',
    color: '#ffffff',
  };

  const githubButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: '#24292e',
    color: '#ffffff',
  };

  const errorStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e53e3e',
    color: '#e53e3e',
    fontSize: '0.9rem',
    background: '#fff5f5',
  };

  const linkStyle: React.CSSProperties = {
    color: '#171717',
    textDecoration: 'underline',
    fontSize: '0.9rem',
  };

  const dividerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    color: '#999',
    fontSize: '0.85rem',
  };

  const lineStyle: React.CSSProperties = {
    flex: 1,
    height: '1px',
    background: '#e0e0e0',
  };

  return (
    <div style={containerStyle}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, textAlign: 'center' }}>
          Log in
        </h1>
        <p
          style={{
            color: '#666',
            textAlign: 'center',
            marginBottom: '0.5rem',
          }}
        >
          Welcome back to Maintanium
        </p>

        {error && <div style={errorStyle}>{error}</div>}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          required
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
          disabled={loading}
        />

        <button type="submit" style={primaryButtonStyle} disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>

        <div style={dividerStyle}>
          <div style={lineStyle} />
          <span>or</span>
          <div style={lineStyle} />
        </div>

        <button
          type="button"
          onClick={handleGithub}
          style={githubButtonStyle}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in with GitHub'}
        </button>

        <p style={{ textAlign: 'center', marginTop: '0.5rem' }}>
          Don&apos;t have an account?{' '}
          <a href="/signup" style={linkStyle}>
            Sign up
          </a>
        </p>
      </form>
    </div>
  );
}
