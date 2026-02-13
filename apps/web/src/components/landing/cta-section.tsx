'use client';

import Link from 'next/link';
import { SectionReveal } from './section-reveal';

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: '#000',
  position: 'relative',
  overflow: 'hidden',
  padding: 'clamp(4rem, 8vh, 8rem) clamp(1.5rem, 4vw, 3rem)',
};

const glowStyle: React.CSSProperties = {
  position: 'absolute',
  width: '60vw',
  height: '60vw',
  maxWidth: 600,
  maxHeight: 600,
  borderRadius: '50%',
  background:
    'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
};

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
  fontWeight: 700,
  color: '#fff',
  textAlign: 'center',
  letterSpacing: '-0.03em',
  lineHeight: 1.15,
  position: 'relative',
  zIndex: 1,
};

const subheadStyle: React.CSSProperties = {
  fontSize: 'clamp(1rem, 2vw, 1.2rem)',
  color: 'rgba(255, 255, 255, 0.5)',
  textAlign: 'center',
  maxWidth: 440,
  lineHeight: 1.6,
  marginTop: '1rem',
  position: 'relative',
  zIndex: 1,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginTop: '2.5rem',
  position: 'relative',
  zIndex: 1,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.85rem 2rem',
  fontSize: '1rem',
  fontWeight: 600,
  backgroundColor: '#fff',
  color: '#000',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'transform 0.2s',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.85rem 2rem',
  fontSize: '1rem',
  fontWeight: 600,
  backgroundColor: 'transparent',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: 8,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'border-color 0.2s',
};

export function CtaSection() {
  return (
    <section className="landing-snap-section" style={sectionStyle}>
      <div style={glowStyle} />
      <SectionReveal>
        <h2 style={headingStyle}>Ship with confidence</h2>
        <p style={subheadStyle}>
          Stop firefighting production issues. Let AI handle the maintenance
          while you build what matters.
        </p>
        <div style={buttonRowStyle}>
          <Link href="/signup" style={primaryBtnStyle}>
            Start Free
          </Link>
          <Link href="/login" style={secondaryBtnStyle}>
            Sign In
          </Link>
        </div>
      </SectionReveal>
    </section>
  );
}
