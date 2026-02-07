'use client';

export function DashboardContent() {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 65px)',
    padding: '2rem',
    textAlign: 'center',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  };

  const descriptionStyle: React.CSSProperties = {
    color: '#666',
    fontSize: '1rem',
    marginBottom: '1.5rem',
  };

  const ctaStyle: React.CSSProperties = {
    padding: '0.75rem 1.5rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    background: 'transparent',
    fontSize: '0.95rem',
    color: '#666',
    cursor: 'default',
  };

  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>No projects yet</h1>
      <p style={descriptionStyle}>
        Your projects will appear here once you create one.
      </p>
      <div style={ctaStyle}>Project creation coming soon</div>
    </div>
  );
}
