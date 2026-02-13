'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const navStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 clamp(1.5rem, 4vw, 3rem)',
  height: 64,
};

const logoStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 700,
  color: '#fff',
  textDecoration: 'none',
  letterSpacing: '-0.02em',
};

const linksStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2rem',
};

const linkStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: 'rgba(255, 255, 255, 0.7)',
  textDecoration: 'none',
  transition: 'color 0.2s',
};

const signInStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#000',
  backgroundColor: '#fff',
  padding: '0.45rem 1.1rem',
  borderRadius: 6,
  textDecoration: 'none',
  transition: 'opacity 0.2s',
};

export function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const container = document.querySelector('.landing-scroll-container');
    if (!container) return;

    const onScroll = () => {
      setScrolled(container.scrollTop > 50);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`landing-nav${scrolled ? ' scrolled' : ''}`}
      style={navStyle}
    >
      <Link href="/" style={logoStyle}>
        MaintainAI
      </Link>

      <div className="landing-nav-links" style={linksStyle}>
        <a href="#features" style={linkStyle}>
          Features
        </a>
        <a href="#how-it-works" style={linkStyle}>
          How It Works
        </a>
        <a href="#metrics" style={linkStyle}>
          Metrics
        </a>
        <Link href="/login" style={signInStyle}>
          Sign In
        </Link>
      </div>
    </nav>
  );
}
