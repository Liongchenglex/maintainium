'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { HeroDecorations } from './hero-decorations';

const sectionStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  backgroundColor: '#000',
  overflow: 'hidden',
};

/* This wrapper holds EVERYTHING — decorations + text.
   We scale this entire layer so the circles rush outward
   past the viewport edges, creating a "zoom into" feel. */
const zoomLayerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  willChange: 'transform, opacity',
  transformOrigin: 'center center',
};

const contentStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: '0 1.5rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'clamp(2.5rem, 8vw, 5.5rem)',
  fontWeight: 700,
  color: '#fff',
  letterSpacing: '-0.03em',
  lineHeight: 1.1,
  animation: 'fadeUp 0.8s ease-out forwards',
  opacity: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 'clamp(1rem, 2.5vw, 1.35rem)',
  color: 'rgba(255, 255, 255, 0.6)',
  maxWidth: 560,
  lineHeight: 1.6,
  marginTop: '1.25rem',
  animation: 'fadeUp 0.8s ease-out 0.2s forwards',
  opacity: 0,
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginTop: '2.5rem',
  animation: 'fadeUp 0.8s ease-out 0.4s forwards',
  opacity: 0,
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
  transition: 'transform 0.2s, box-shadow 0.2s',
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

export function HeroSection() {
  const zoomRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = sectionRef.current?.closest('.landing-scroll-container');
    if (!container || !zoomRef.current) return;

    let raf: number;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = zoomRef.current;
        if (!el) return;
        const scrollY = (container as HTMLElement).scrollTop;
        const vh = window.innerHeight;
        // progress 0→1 over the first viewport of scrolling
        const progress = Math.min(scrollY / vh, 1);
        // Scale 1→3: circles rush outward past screen edges
        const scale = 1 + progress * 2;
        // Fade out over the first 60% of scroll so it's gone before snap
        const opacity = Math.max(1 - progress / 0.6, 0);
        el.style.transform = `scale(${scale})`;
        el.style.opacity = `${opacity}`;
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="landing-snap-section"
      style={sectionStyle}
    >
      {/* Zoom layer: scales the entire hero (decorations + content) */}
      <div ref={zoomRef} style={zoomLayerStyle}>
        <HeroDecorations />
        <div style={contentStyle}>
          <h1 style={titleStyle}>MaintainAI</h1>
          <p style={subtitleStyle}>
            AI-powered codebase intelligence that monitors, diagnoses, and
            maintains your software — so you can ship with confidence.
          </p>
          <div style={buttonRowStyle}>
            <Link href="/signup" style={primaryBtnStyle}>
              Get Started Free
            </Link>
            <Link href="#features" style={secondaryBtnStyle}>
              See How It Works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
