'use client';

const decorations: {
  type: 'circle' | 'ring' | 'dot';
  size: number;
  top: string;
  left: string;
  animation: string;
  duration: string;
  delay: string;
  opacity: number;
  border?: number;
  large?: boolean;
}[] = [
  // Large statement rings
  { type: 'ring', size: 300, top: '50%', left: '50%', animation: 'rotateSlow', duration: '40s', delay: '0s', opacity: 0.06, border: 1, large: true },
  { type: 'ring', size: 500, top: '50%', left: '50%', animation: 'rotateSlow', duration: '60s', delay: '0s', opacity: 0.04, border: 1, large: true },
  { type: 'ring', size: 180, top: '20%', left: '10%', animation: 'float', duration: '8s', delay: '0s', opacity: 0.1, border: 1.5, large: true },
  { type: 'ring', size: 120, top: '65%', left: '82%', animation: 'floatReverse', duration: '9s', delay: '1s', opacity: 0.1, border: 1.5, large: true },

  // Medium filled circles — visible white orbs
  { type: 'circle', size: 60, top: '18%', left: '78%', animation: 'float', duration: '7s', delay: '0.5s', opacity: 0.07 },
  { type: 'circle', size: 40, top: '72%', left: '12%', animation: 'floatReverse', duration: '6s', delay: '0s', opacity: 0.08 },
  { type: 'circle', size: 80, top: '40%', left: '88%', animation: 'float', duration: '8s', delay: '1.5s', opacity: 0.05, large: true },
  { type: 'circle', size: 50, top: '80%', left: '65%', animation: 'floatReverse', duration: '7s', delay: '0.8s', opacity: 0.06 },

  // Medium rings scattered
  { type: 'ring', size: 70, top: '30%', left: '20%', animation: 'rotateSlow', duration: '15s', delay: '0s', opacity: 0.12, border: 1 },
  { type: 'ring', size: 90, top: '55%', left: '70%', animation: 'rotateSlow', duration: '18s', delay: '2s', opacity: 0.1, border: 1 },
  { type: 'ring', size: 55, top: '75%', left: '35%', animation: 'float', duration: '6s', delay: '0.3s', opacity: 0.1, border: 1 },

  // Small bright dots — star-like accents
  { type: 'dot', size: 6, top: '15%', left: '30%', animation: 'pulse', duration: '3s', delay: '0s', opacity: 0.6 },
  { type: 'dot', size: 5, top: '25%', left: '65%', animation: 'pulse', duration: '3.5s', delay: '0.5s', opacity: 0.5 },
  { type: 'dot', size: 4, top: '45%', left: '8%', animation: 'pulse', duration: '4s', delay: '1s', opacity: 0.5 },
  { type: 'dot', size: 6, top: '60%', left: '92%', animation: 'pulse', duration: '3s', delay: '0.8s', opacity: 0.6 },
  { type: 'dot', size: 5, top: '85%', left: '48%', animation: 'pulse', duration: '3.5s', delay: '1.5s', opacity: 0.5 },
  { type: 'dot', size: 4, top: '35%', left: '45%', animation: 'pulse', duration: '4s', delay: '0.2s', opacity: 0.4 },
  { type: 'dot', size: 3, top: '70%', left: '25%', animation: 'pulse', duration: '3s', delay: '1.2s', opacity: 0.5 },
  { type: 'dot', size: 5, top: '10%', left: '50%', animation: 'pulse', duration: '3.5s', delay: '0.7s', opacity: 0.4 },
  { type: 'dot', size: 4, top: '90%', left: '80%', animation: 'pulse', duration: '4s', delay: '1.8s', opacity: 0.5 },

  // Medium dots — slightly larger accents
  { type: 'dot', size: 10, top: '22%', left: '88%', animation: 'pulse', duration: '4s', delay: '0.3s', opacity: 0.35 },
  { type: 'dot', size: 12, top: '68%', left: '5%', animation: 'pulse', duration: '3.5s', delay: '1s', opacity: 0.3 },
  { type: 'dot', size: 8, top: '50%', left: '55%', animation: 'pulse', duration: '4.5s', delay: '0.6s', opacity: 0.25 },
];

function getDecorationStyle(d: (typeof decorations)[number]): React.CSSProperties {
  const isCentered = d.top === '50%' && d.left === '50%';
  const base: React.CSSProperties = {
    position: 'absolute',
    top: d.top,
    left: d.left,
    animation: `${d.animation} ${d.duration} linear ${d.delay} infinite`,
    pointerEvents: 'none',
    ...(isCentered && {
      transform: 'translate(-50%, -50%)',
    }),
  };

  switch (d.type) {
    case 'circle':
      return {
        ...base,
        width: d.size,
        height: d.size,
        borderRadius: '50%',
        backgroundColor: `rgba(255, 255, 255, ${d.opacity})`,
      };
    case 'ring':
      return {
        ...base,
        width: d.size,
        height: d.size,
        borderRadius: '50%',
        border: `${d.border ?? 1}px solid rgba(255, 255, 255, ${d.opacity})`,
        backgroundColor: 'transparent',
      };
    case 'dot':
      return {
        ...base,
        width: d.size,
        height: d.size,
        borderRadius: '50%',
        backgroundColor: `rgba(255, 255, 255, ${d.opacity})`,
        boxShadow: `0 0 ${d.size * 2}px rgba(255, 255, 255, ${d.opacity * 0.5})`,
      };
  }
}

export function HeroDecorations() {
  return (
    <>
      {decorations.map((d, i) => (
        <div
          key={i}
          className={d.large ? 'landing-decoration-large' : undefined}
          style={getDecorationStyle(d)}
        />
      ))}
    </>
  );
}
