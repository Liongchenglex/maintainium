'use client';

import { SectionReveal } from './section-reveal';

const painPoints = [
  {
    number: '01',
    text: 'Critical vulnerabilities buried in dependency trees that no one checks until it\u2019s too late.',
  },
  {
    number: '02',
    text: 'Outdated packages silently accumulating tech debt sprint after sprint.',
  },
  {
    number: '03',
    text: 'Production incidents that could have been caught with a single automated scan.',
  },
];

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: '#0a0a0a',
  padding: 'clamp(4rem, 8vh, 8rem) clamp(1.5rem, 4vw, 3rem)',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: 'rgba(255, 255, 255, 0.35)',
  marginBottom: '1.5rem',
};

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
  fontWeight: 700,
  color: '#fff',
  textAlign: 'center',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
  maxWidth: 700,
};

const bodyStyle: React.CSSProperties = {
  fontSize: 'clamp(1rem, 1.8vw, 1.15rem)',
  color: 'rgba(255, 255, 255, 0.5)',
  textAlign: 'center',
  maxWidth: 580,
  lineHeight: 1.7,
  marginTop: '1.25rem',
};

const dividerStyle: React.CSSProperties = {
  width: 40,
  height: 1,
  backgroundColor: 'rgba(255, 255, 255, 0.15)',
  margin: '3rem 0',
};

const painListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
  maxWidth: 540,
  width: '100%',
};

const painItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '1rem',
};

const painNumberStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'rgba(255, 255, 255, 0.25)',
  lineHeight: 1.7,
  flexShrink: 0,
  fontVariantNumeric: 'tabular-nums',
};

const painTextStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  color: 'rgba(255, 255, 255, 0.55)',
  lineHeight: 1.7,
};

export function VisionSection() {
  return (
    <section className="landing-snap-section" style={sectionStyle}>
      <SectionReveal>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={labelStyle}>The Problem</span>
          <h2 style={headingStyle}>
            Software maintenance is broken
          </h2>
          <p style={bodyStyle}>
            Engineering teams spend up to 40% of their time on maintenance —
            chasing vulnerabilities, updating dependencies, and firefighting
            production issues. Most of it is preventable.
          </p>
        </div>
      </SectionReveal>

      <SectionReveal delay={200}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={dividerStyle} />
        </div>
      </SectionReveal>

      <SectionReveal delay={300}>
        <div style={painListStyle}>
          {painPoints.map((p) => (
            <div key={p.number} style={painItemStyle}>
              <span style={painNumberStyle}>{p.number}</span>
              <p style={painTextStyle}>{p.text}</p>
            </div>
          ))}
        </div>
      </SectionReveal>

      <SectionReveal delay={500}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={dividerStyle} />
        </div>
      </SectionReveal>

      <SectionReveal delay={600}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ ...labelStyle, marginBottom: '1rem' }}>Our Vision</span>
          <p style={{
            ...bodyStyle,
            marginTop: 0,
            color: 'rgba(255, 255, 255, 0.7)',
            fontWeight: 500,
            fontSize: 'clamp(1.05rem, 2vw, 1.25rem)',
          }}>
            An AI agent that continuously understands your codebase, surfaces
            risks before they become incidents, and gives every team the
            maintenance superpowers of a dedicated SRE — zero config, every push.
          </p>
        </div>
      </SectionReveal>
    </section>
  );
}
