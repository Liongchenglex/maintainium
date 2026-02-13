'use client';

import { useEffect, useRef, useState } from 'react';
import { SectionReveal } from './section-reveal';

interface Metric {
  value: number;
  suffix: string;
  label: string;
}

const metrics: Metric[] = [
  { value: 8, suffix: '', label: 'Integrated Scanners' },
  { value: 60, suffix: 's', label: 'Average Scan Time' },
  { value: 0, suffix: '', label: 'Configuration Needed' },
  { value: 24, suffix: '/7', label: 'Real-time Alerts' },
];

const prefixes = ['', '<', 'Zero', ''];

function AnimatedCounter({
  value,
  suffix,
  prefix,
}: {
  value: number;
  suffix: string;
  prefix: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started || value === 0) return;

    let current = 0;
    const step = Math.max(1, Math.floor(value / 30));
    const interval = setInterval(() => {
      current += step;
      if (current >= value) {
        setCount(value);
        clearInterval(interval);
      } else {
        setCount(current);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [started, value]);

  const display = value === 0 ? prefix : `${prefix}${count}${suffix}`;

  return <span ref={ref}>{display}</span>;
}

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

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '2rem',
  marginTop: '4rem',
  maxWidth: 800,
  width: '100%',
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
  fontWeight: 700,
  color: '#000',
  lineHeight: 1,
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#666',
  marginTop: '0.5rem',
};

const metricItemStyle: React.CSSProperties = {
  textAlign: 'center',
};

export function MetricsSection() {
  return (
    <section
      id="metrics"
      className="landing-snap-section"
      style={sectionStyle}
    >
      <SectionReveal>
        <h2 style={headingStyle}>Built for scale</h2>
      </SectionReveal>

      <div className="landing-metrics-grid" style={gridStyle}>
        {metrics.map((m, i) => (
          <SectionReveal key={m.label} delay={i * 100}>
            <div style={metricItemStyle}>
              <div style={metricValueStyle}>
                <AnimatedCounter
                  value={m.value}
                  suffix={m.suffix}
                  prefix={prefixes[i]}
                />
              </div>
              <p style={metricLabelStyle}>{m.label}</p>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  );
}
