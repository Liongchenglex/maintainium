'use client';

import { SectionReveal } from './section-reveal';

const features = [
  {
    icon: '\u26A0',
    title: 'Vulnerability Detection',
    desc: 'Automated CVE scanning across every dependency in your lock file, with severity scoring and remediation guidance.',
  },
  {
    icon: '\u2B21',
    title: 'Dependency Intelligence',
    desc: 'Track freshness, detect abandoned packages, and get upgrade-path recommendations before they become risks.',
  },
  {
    icon: '\u2661',
    title: 'Code Health',
    desc: 'Complexity metrics, dead-code detection, and pattern consistency checks that keep your codebase maintainable.',
  },
  {
    icon: '\u2316',
    title: 'AI Investigation',
    desc: 'Submit an issue and let AI triage it — classifying into feature areas, diagnosing root cause, and proposing fixes.',
  },
  {
    icon: '\u25CE',
    title: 'Real-time Scanning',
    desc: 'Every push triggers a full analysis pipeline so findings are always current — no stale reports.',
  },
  {
    icon: '\u2600',
    title: 'Production Monitoring',
    desc: 'Uptime checks, SSL expiry alerts, and environment exposure scans keep your live deployments safe.',
  },
];

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: '#fff',
  padding: 'clamp(4rem, 8vh, 8rem) clamp(1.5rem, 4vw, 3rem)',
};

const headingStyle: React.CSSProperties = {
  fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
  fontWeight: 700,
  color: '#000',
  textAlign: 'center',
  letterSpacing: '-0.02em',
};

const subheadStyle: React.CSSProperties = {
  fontSize: 'clamp(0.95rem, 1.8vw, 1.1rem)',
  color: '#666',
  textAlign: 'center',
  maxWidth: 520,
  lineHeight: 1.6,
  marginTop: '0.75rem',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '1.5rem',
  marginTop: '3.5rem',
  maxWidth: 960,
  width: '100%',
};

const cardStyle: React.CSSProperties = {
  padding: '2rem 1.75rem',
  borderRadius: 12,
  border: '1px solid #eee',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const iconStyle: React.CSSProperties = {
  fontSize: '1.5rem',
  marginBottom: '0.75rem',
  display: 'block',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  fontWeight: 600,
  color: '#000',
  marginBottom: '0.5rem',
};

const cardDescStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#666',
  lineHeight: 1.6,
};

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="landing-snap-section"
      style={sectionStyle}
    >
      <SectionReveal>
        <h2 style={headingStyle}>Everything your codebase needs</h2>
        <p style={subheadStyle}>
          Six integrated scanners that work together to keep your software
          healthy, secure, and up to date.
        </p>
      </SectionReveal>

      <div className="landing-features-grid" style={gridStyle}>
        {features.map((f, i) => (
          <SectionReveal key={f.title} delay={i * 80}>
            <div style={cardStyle}>
              <span style={iconStyle}>{f.icon}</span>
              <h3 style={cardTitleStyle}>{f.title}</h3>
              <p style={cardDescStyle}>{f.desc}</p>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
