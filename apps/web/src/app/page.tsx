import { HealthStatus } from '@/components/health-status';

export default function Home() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '2rem',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700 }}>MaintainAI</h1>
      <p style={{ color: '#666', fontSize: '1.1rem' }}>
        AI-powered maintenance platform
      </p>
      <HealthStatus />
    </main>
  );
}
