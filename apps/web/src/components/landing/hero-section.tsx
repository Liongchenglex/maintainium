'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { HeroDecorations } from './hero-decorations';
import { WaitlistModal } from './waitlist-modal';

/* ── Fragment definitions ──
   4 irregular quadrilateral pieces that tile the full viewport.
   On scroll each piece flies in its diagonal direction + rotates,
   tearing the black surface apart like cracking glass. */
const fragments = [
  // Top-left shard
  { clip: 'polygon(0% 0%, 58% 0%, 50% 50%, 0% 58%)', tx: -50, ty: -50, rotate: -12 },
  // Top-right shard
  { clip: 'polygon(58% 0%, 100% 0%, 100% 58%, 50% 50%)', tx: 50, ty: -50, rotate: 10 },
  // Bottom-left shard
  { clip: 'polygon(0% 58%, 50% 50%, 58% 100%, 0% 100%)', tx: -50, ty: 50, rotate: 8 },
  // Bottom-right shard
  { clip: 'polygon(50% 50%, 100% 58%, 100% 100%, 58% 100%)', tx: 50, ty: 50, rotate: -14 },
];

const fragmentStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundColor: '#000',
  willChange: 'transform, opacity',
};

const sectionStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  /* No overflow:hidden — fragments fly outside section bounds */
  overflow: 'visible',
};

/* Decorations + text live in a clipped inner layer so they
   don't bleed outside the section at rest. */
const innerLayerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
};

const contentStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  padding: '0 1.5rem',
  pointerEvents: 'auto',
  willChange: 'transform, opacity',
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
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fragmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const setFragmentRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      fragmentRefs.current[index] = el;
    },
    [],
  );

  useEffect(() => {
    const container = sectionRef.current?.closest('.landing-scroll-container');
    if (!container) return;

    let raf: number;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const scrollY = (container as HTMLElement).scrollTop;
        const vh = window.innerHeight;
        // progress 0→1 over first viewport of scroll
        const progress = Math.min(scrollY / vh, 1);
        // Ease-out curve for a weighty, dramatic feel
        const eased = 1 - Math.pow(1 - progress, 2);

        // ── Fragments: fly outward ──
        fragmentRefs.current.forEach((el, i) => {
          if (!el) return;
          const f = fragments[i];
          const tx = f.tx * eased;
          const ty = f.ty * eased;
          const rot = f.rotate * eased;
          el.style.transform = `translate(${tx}vw, ${ty}vh) rotate(${rot}deg)`;
          el.style.opacity = `${Math.max(1 - eased * 0.8, 0)}`;
        });

        // ── Content + decorations: scale up (zoom into) and fade ──
        const el = contentRef.current;
        if (el) {
          const scale = 1 + eased * 1.5;
          const opacity = Math.max(1 - progress / 0.5, 0);
          el.style.transform = `scale(${scale})`;
          el.style.opacity = `${opacity}`;
        }
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
      {/* Fragment layer — the black surface that shatters */}
      {fragments.map((f, i) => (
        <div
          key={i}
          ref={setFragmentRef(i)}
          style={{ ...fragmentStyle, clipPath: f.clip }}
        />
      ))}

      {/* Inner layer — decorations + content, clipped and zooms in */}
      <div style={innerLayerStyle}>
        <div
          ref={contentRef}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            willChange: 'transform, opacity',
            transformOrigin: 'center center',
          }}
        >
          <HeroDecorations />
          <div style={contentStyle}>
            <h1 style={titleStyle}>Maintanium</h1>
            <p style={subtitleStyle}>
              AI-powered codebase intelligence that monitors, diagnoses, and
              maintains your software — so you can ship with confidence.
            </p>
            <div style={buttonRowStyle}>
              <button style={primaryBtnStyle} onClick={() => setModalOpen(true)}>
                Join Waitlist
              </button>
              <a href="#features" style={secondaryBtnStyle}>
                See How It Works
              </a>
            </div>
          </div>
        </div>
      </div>

      <WaitlistModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
