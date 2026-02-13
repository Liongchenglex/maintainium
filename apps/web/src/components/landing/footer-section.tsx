const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2rem clamp(1.5rem, 4vw, 3rem)',
  backgroundColor: '#000',
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  flexWrap: 'wrap',
  gap: '1rem',
};

const logoStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 600,
  color: '#fff',
};

const copyStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'rgba(255, 255, 255, 0.35)',
};

export function FooterSection() {
  return (
    <footer style={footerStyle}>
      <span style={logoStyle}>Maintanium</span>
      <span style={copyStyle}>
        &copy; {new Date().getFullYear()} Maintanium. All rights reserved.
      </span>
    </footer>
  );
}
