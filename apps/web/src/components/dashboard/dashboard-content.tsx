'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { get } from '@/lib/api';
import { ProjectCard, ProjectCardData } from './project-card';

export function DashboardContent() {
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    try {
      const data = await get<ProjectCardData[]>('/projects');
      setProjects(data);
    } catch {
      // Silent — show empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Poll while any project has an active analysis
  useEffect(() => {
    const hasActive = projects.some(
      (p) => p.analysisStatus === 'pending' || p.analysisStatus === 'analyzing',
    );
    if (hasActive) {
      const interval = setInterval(fetchProjects, 5000);
      return () => clearInterval(interval);
    }
  }, [projects]);

  const containerStyle: React.CSSProperties = {
    maxWidth: '900px',
    margin: '2rem auto',
    padding: '0 1rem',
  };

  const headerRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 600,
  };

  const ctaStyle: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    background: '#111',
    color: '#fff',
    fontSize: '0.9rem',
    cursor: 'pointer',
    textDecoration: 'none',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  };

  const emptyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 65px)',
    padding: '2rem',
    textAlign: 'center',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#666' }}>Loading projects...</p>
      </div>
    );
  }

  // Empty state
  if (projects.length === 0) {
    return (
      <div style={emptyStyle}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
          No projects yet
        </h1>
        <p style={{ color: '#666', fontSize: '1rem', marginBottom: '1.5rem' }}>
          Your projects will appear here once you create one.
        </p>
        <Link href="/dashboard/connect" style={ctaStyle}>
          Connect Repository
        </Link>
      </div>
    );
  }

  // Projects list
  return (
    <div style={containerStyle}>
      <div style={headerRow}>
        <h1 style={headingStyle}>Projects</h1>
        <Link href="/dashboard/connect" style={ctaStyle}>
          Connect Repository
        </Link>
      </div>
      <div style={gridStyle}>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
