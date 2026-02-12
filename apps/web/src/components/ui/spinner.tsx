'use client';

import { useId } from 'react';

interface SpinnerProps {
  color?: string;
  size?: number;
}

export function Spinner({ color = '#666', size = 10 }: SpinnerProps) {
  const id = useId();
  const animationName = `spin-${id.replace(/:/g, '')}`;

  return (
    <>
      <style>{`@keyframes ${animationName} { to { transform: rotate(360deg); } }`}</style>
      <span
        role="status"
        aria-label="Loading"
        style={{
          display: 'inline-block',
          width: size,
          height: size,
          border: `2px solid ${color}33`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: `${animationName} 0.6s linear infinite`,
        }}
      />
    </>
  );
}
