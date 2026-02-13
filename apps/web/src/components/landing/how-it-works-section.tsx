'use client';

import { SectionReveal } from './section-reveal';

const steps = [
  {
    number: '01',
    title: 'Connect',
    desc: 'Link your GitHub repository in one click. Maintanium automatically receives push events via webhooks.',
  },
  {
    number: '02',
    title: 'Analyze',
    desc: 'Our AI agent downloads your codebase, maps dependencies, and runs 8 specialised scanners in under 60 seconds.',
  },
  {
    number: '03',
    title: 'Maintain',
    desc: 'Get actionable findings, automated triage, and fix suggestions — continuously, on every push.',
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

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
  fontWeight: 700,
  color: '#fff',
  textAlign: 'center',
  letterSpacing: '-0.02em',
};

const subheadStyle: React.CSSProperties = {
  fontSize: 'clamp(0.95rem, 1.8vw, 1.1rem)',
  color: 'rgba(255, 255, 255, 0.5)',
  textAlign: 'center',
  maxWidth: 480,
  lineHeight: 1.6,
  marginTop: '0.75rem',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: '3rem',
  marginTop: '4rem',
  maxWidth: 900,
  width: '100%',
  position: 'relative',
};

const lineStyle: React.CSSProperties = {
  position: 'absolute',
  top: 28,
  left: '18%',
  right: '18%',
  height: 1,
  backgroundColor: 'rgba(255, 255, 255, 0.12)',
};

const stepStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  position: 'relative',
  zIndex: 1,
};

const numberStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.875rem',
  fontWeight: 700,
  color: '#fff',
  backgroundColor: '#0a0a0a',
  marginBottom: '1.25rem',
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: '1.15rem',
  fontWeight: 600,
  color: '#fff',
  marginBottom: '0.5rem',
};

const stepDescStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: 'rgba(255, 255, 255, 0.5)',
  lineHeight: 1.6,
  maxWidth: 220,
};

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="landing-snap-section"
      style={sectionStyle}
    >
      <SectionReveal>
        <h2 style={headingStyle}>How it works</h2>
        <p style={subheadStyle}>
          Three steps from connected repo to continuous, AI-driven maintenance.
        </p>
      </SectionReveal>

      <div className="landing-steps-row" style={rowStyle}>
        <div className="landing-steps-line" style={lineStyle} />
        {steps.map((s, i) => (
          <SectionReveal key={s.number} delay={i * 150}>
            <div style={stepStyle}>
              <div style={numberStyle}>{s.number}</div>
              <h3 style={stepTitleStyle}>{s.title}</h3>
              <p style={stepDescStyle}>{s.desc}</p>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
