'use client';

import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase';

interface WaitlistModalProps {
  open: boolean;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  padding: '1.5rem',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#111',
  borderRadius: 16,
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: 'clamp(2rem, 4vw, 3rem)',
  maxWidth: 420,
  width: '100%',
  position: 'relative',
};

const closeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  background: 'none',
  border: 'none',
  color: 'rgba(255, 255, 255, 0.4)',
  fontSize: '1.25rem',
  cursor: 'pointer',
  lineHeight: 1,
  padding: 4,
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#fff',
  marginBottom: '0.5rem',
};

const descStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'rgba(255, 255, 255, 0.5)',
  lineHeight: 1.6,
  marginBottom: '1.5rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  fontSize: '0.95rem',
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 8,
  color: '#fff',
  outline: 'none',
  marginBottom: '1rem',
};

const submitStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  fontSize: '0.95rem',
  fontWeight: 600,
  backgroundColor: '#fff',
  color: '#000',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};

const successStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '1rem 0',
};

const successIconStyle: React.CSSProperties = {
  fontSize: '2rem',
  marginBottom: '0.75rem',
  display: 'block',
};

const successTitleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: 700,
  color: '#fff',
  marginBottom: '0.5rem',
};

const successDescStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: 'rgba(255, 255, 255, 0.5)',
  lineHeight: 1.6,
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: '#f87171',
  marginBottom: '0.75rem',
};

export function WaitlistModal({ open, onClose }: WaitlistModalProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg('Please enter a valid email address.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    try {
      const db = getFirebaseFirestore();
      await addDoc(collection(db, 'waitlist'), {
        email: trimmed,
        createdAt: serverTimestamp(),
      });
      setStatus('success');
    } catch (err) {
      console.error('[waitlist] Failed to submit:', err);
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={cardStyle}>
        <button style={closeStyle} onClick={onClose} aria-label="Close">
          &times;
        </button>

        {status === 'success' ? (
          <div style={successStyle}>
            <span style={successIconStyle}>&check;</span>
            <h3 style={successTitleStyle}>You&apos;re on the list</h3>
            <p style={successDescStyle}>
              We&apos;ll notify you when Maintanium is ready. Thanks for your interest.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h3 style={titleStyle}>Join the Waitlist</h3>
            <p style={descStyle}>
              Be the first to know when Maintanium launches. Enter your email
              and we&apos;ll keep you in the loop.
            </p>
            {status === 'error' && <p style={errorStyle}>{errorMsg}</p>}
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              autoFocus
              disabled={status === 'submitting'}
            />
            <button
              type="submit"
              style={{
                ...submitStyle,
                opacity: status === 'submitting' ? 0.6 : 1,
              }}
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Joining...' : 'Join Waitlist'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
