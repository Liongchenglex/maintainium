'use client';

const decorations: {
  type: 'circle' | 'ring' | 'dot' | 'line';
  size: number;
  top: string;
  left: string;
  animation: string;
  duration: string;
  delay: string;
  large?: boolean;
}[] = [
  { type: 'ring', size: 120, top: '12%', left: '8%', animation: 'float', duration: '6s', delay: '0s', large: true },
  { type: 'circle', size: 8, top: '20%', left: '85%', animation: 'pulse', duration: '3s', delay: '0.5s' },
  { type: 'ring', size: 80, top: '70%', left: '88%', animation: 'floatReverse', duration: '7s', delay: '1s', large: true },
  { type: 'dot', size: 6, top: '45%', left: '5%', animation: 'pulse', duration: '4s', delay: '0.2s' },
  { type: 'circle', size: 10, top: '80%', left: '15%', animation: 'float', duration: '5s', delay: '1.5s' },
  { type: 'dot', size: 4, top: '30%', left: '92%', animation: 'pulse', duration: '3.5s', delay: '0.8s' },
  { type: 'ring', size: 50, top: '55%', left: '75%', animation: 'rotateSlow', duration: '12s', delay: '0s' },
  { type: 'line', size: 60, top: '35%', left: '18%', animation: 'float', duration: '8s', delay: '2s', large: true },
  { type: 'dot', size: 5, top: '65%', left: '40%', animation: 'pulse', duration: '4.5s', delay: '1.2s' },
  { type: 'circle', size: 7, top: '15%', left: '60%', animation: 'floatReverse', duration: '5.5s', delay: '0.3s' },
  { type: 'ring', size: 35, top: '85%', left: '55%', animation: 'rotateSlow', duration: '10s', delay: '0.5s' },
  { type: 'dot', size: 3, top: '50%', left: '30%', animation: 'pulse', duration: '3s', delay: '1.8s' },
];

function getDecorationStyle(d: (typeof decorations)[number]): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    top: d.top,
    left: d.left,
    animation: `${d.animation} ${d.duration} ease-in-out ${d.delay} infinite`,
    pointerEvents: 'none',
  };

  switch (d.type) {
    case 'circle':
      return {
        ...base,
        width: d.size,
        height: d.size,
        borderRadius: '50%',
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
      };
    case 'ring':
      return {
        ...base,
        width: d.size,
        height: d.size,
        borderRadius: '50%',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: 'transparent',
      };
    case 'dot':
      return {
        ...base,
        width: d.size,
        height: d.size,
        borderRadius: '50%',
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
      };
    case 'line':
      return {
        ...base,
        width: d.size,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        transform: 'rotate(-30deg)',
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
