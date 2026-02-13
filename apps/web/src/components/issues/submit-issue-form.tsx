'use client';

import { useState } from 'react';
import { post } from '@/lib/api';

interface SubmitIssueFormProps {
  projectId: string;
  onSubmitted: () => void;
  onCancel: () => void;
}

export function SubmitIssueForm({ projectId, onSubmitted, onCancel }: SubmitIssueFormProps) {
  const [reporterEmail, setReporterEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await post(`/projects/${projectId}/issues`, {
        reporterEmail,
        subject,
        description,
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <form onSubmit={handleSubmit} style={formStyle}>
        <div style={formHeaderStyle}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#1a1a1a' }}>
            Submit New Issue
          </h3>
          <button type="button" onClick={onCancel} style={closeButtonStyle}>
            &times;
          </button>
        </div>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        <div style={fieldStyle}>
          <label style={labelStyle}>Reporter Email</label>
          <input
            type="email"
            required
            value={reporterEmail}
            onChange={(e) => setReporterEmail(e.target.value)}
            placeholder="user@example.com"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Subject</label>
          <input
            type="text"
            required
            maxLength={500}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of the issue"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Description</label>
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail..."
            rows={6}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={actionsStyle}>
          <button type="button" onClick={onCancel} style={cancelButtonStyle}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} style={submitButtonStyle}>
            {submitting ? 'Submitting...' : 'Submit Issue'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const formStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  padding: '1.5rem',
  width: '100%',
  maxWidth: '520px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
};

const formHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem',
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  color: '#999',
  cursor: 'pointer',
  padding: '0 0.25rem',
  lineHeight: 1,
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#6b778c',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: '0.3rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.65rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  fontSize: '0.88rem',
  color: '#333',
  boxSizing: 'border-box',
};

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
  marginTop: '0.5rem',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '0.45rem 1rem',
  borderRadius: '4px',
  border: '1px solid #dfe1e6',
  backgroundColor: '#fff',
  color: '#666',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
};

const submitButtonStyle: React.CSSProperties = {
  padding: '0.45rem 1rem',
  borderRadius: '4px',
  border: '1px solid #1565c0',
  backgroundColor: '#1565c0',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
};

const errorStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderRadius: '4px',
  backgroundColor: '#ffebee',
  color: '#c62828',
  fontSize: '0.83rem',
  marginBottom: '1rem',
};
