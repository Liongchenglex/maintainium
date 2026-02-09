'use client';

import Link from 'next/link';

interface ProjectCardData {
  id: string;
  name: string;
  githubOwner: string | null;
  githubRepoName: string | null;
  visibility: string;
  healthStatus: string;
  webhookId: number | null;
  updatedAt: string;
}

interface ProjectCardProps {
  project: ProjectCardData;
}

export type { ProjectCardData };

export function ProjectCard({ project }: ProjectCardProps) {
  const cardStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '1.25rem',
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    transition: 'border-color 0.15s',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const ownerStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    color: '#666',
    marginBottom: '0.75rem',
  };

  const badgesRow: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  };

  const badgeBase: React.CSSProperties = {
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 500,
    border: '1px solid',
  };

  const visibilityBadge: React.CSSProperties = {
    ...badgeBase,
    ...(project.visibility === 'private'
      ? { color: '#7c4dff', borderColor: '#e0d4ff', backgroundColor: '#f5f0ff' }
      : { color: '#2e7d32', borderColor: '#c8e6c9', backgroundColor: '#f1f8e9' }),
  };

  const webhookBadge: React.CSSProperties = {
    ...badgeBase,
    ...(project.webhookId
      ? { color: '#2e7d32', borderColor: '#c8e6c9', backgroundColor: '#f1f8e9' }
      : { color: '#e65100', borderColor: '#ffcc80', backgroundColor: '#fff3e0' }),
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      style={cardStyle}
      onMouseOver={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = '#999';
      }}
      onMouseOut={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = '#e0e0e0';
      }}
    >
      <div style={titleStyle}>{project.githubRepoName || project.name}</div>
      <div style={ownerStyle}>{project.githubOwner}</div>
      <div style={badgesRow}>
        <span style={visibilityBadge}>{project.visibility}</span>
        <span style={webhookBadge}>
          {project.webhookId ? 'Webhook active' : 'No webhook'}
        </span>
        <span style={{ ...badgeBase, color: '#666', borderColor: '#e0e0e0', backgroundColor: '#fafafa' }}>
          Updated {formatDate(project.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
