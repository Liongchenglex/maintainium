'use client';

import Link from 'next/link';
import { Spinner } from '../ui/spinner';

interface ProjectCardData {
  id: string;
  name: string;
  githubOwner: string | null;
  githubRepoName: string | null;
  visibility: string;
  healthStatus: string;
  webhookId: number | null;
  updatedAt: string;
  analysisStatus: string | null;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <div style={titleStyle}>{project.githubRepoName || project.name}</div>
        <AnalysisStatusIndicator status={project.analysisStatus} />
      </div>
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

const analysisStatusStyles: Record<string, React.CSSProperties> = {
  pending: { color: '#e65100', backgroundColor: '#fff3e0', borderColor: '#ffcc80' },
  analyzing: { color: '#1565c0', backgroundColor: '#e3f2fd', borderColor: '#90caf9' },
  completed: { color: '#2e7d32', backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' },
  failed: { color: '#c62828', backgroundColor: '#ffebee', borderColor: '#ef9a9a' },
};

function AnalysisStatusIndicator({ status }: { status: string | null }) {
  if (!status) return null;

  const style = analysisStatusStyles[status];
  if (!style) return null;

  const isActive = status === 'pending' || status === 'analyzing';

  return (
    <span
      style={{
        padding: '0.15rem 0.5rem',
        borderRadius: '12px',
        fontSize: '0.7rem',
        fontWeight: 500,
        border: '1px solid',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        ...style,
      }}
    >
      {isActive && <Spinner color={style.color as string} size={8} />}
      {status}
    </span>
  );
}
