'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { get, ApiError } from '@/lib/api';
import { BreadcrumbNav } from './breadcrumb-nav';
import { FileTree } from './file-tree';
import { FileViewer } from './file-viewer';
import { GitHubReconnectPrompt } from './github-reconnect-prompt';

interface ProjectData {
  id: string;
  name: string;
  githubOwner: string | null;
  githubRepoName: string | null;
  githubDefaultBranch: string | null;
  visibility: string;
  sourceUrl: string | null;
  healthStatus: string;
  webhookId: number | null;
}

export function ProjectDetail() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const data = await get<ProjectData>(`/projects/${projectId}`);
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  const handleNavigate = (path: string, type?: 'directory' | 'file') => {
    if (type === 'file') {
      setViewingFile(path);
    } else {
      setCurrentPath(path);
      setViewingFile(null);
    }
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '900px',
    margin: '2rem auto',
    padding: '0 1rem',
  };

  const headerStyle: React.CSSProperties = {
    marginBottom: '1.5rem',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const metaStyle: React.CSSProperties = {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.85rem',
    color: '#666',
    marginBottom: '1rem',
  };

  const badgeStyle: React.CSSProperties = {
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 500,
  };

  const breadcrumbContainer: React.CSSProperties = {
    marginBottom: '1rem',
    padding: '0.5rem 0',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#666' }}>Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#c62828' }}>{error || 'Project not found'}</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>
          {project.githubOwner}/{project.githubRepoName}
          <span
            style={{
              ...badgeStyle,
              color: project.visibility === 'private' ? '#7c4dff' : '#2e7d32',
              border: `1px solid ${project.visibility === 'private' ? '#e0d4ff' : '#c8e6c9'}`,
              backgroundColor: project.visibility === 'private' ? '#f5f0ff' : '#f1f8e9',
            }}
          >
            {project.visibility}
          </span>
        </h1>
        <div style={metaStyle}>
          <span>Branch: {project.githubDefaultBranch}</span>
          <span>
            Webhook: {project.webhookId ? 'Active' : 'Not registered'}
          </span>
        </div>
      </div>

      <div style={breadcrumbContainer}>
        <BreadcrumbNav
          path={viewingFile || currentPath}
          onNavigate={(p) => handleNavigate(p)}
          repoName={project.githubRepoName || project.name}
        />
      </div>

      {tokenExpired ? (
        <GitHubReconnectPrompt />
      ) : viewingFile ? (
        <FileViewer projectId={projectId} path={viewingFile} onTokenExpired={() => setTokenExpired(true)} />
      ) : (
        <FileTree
          projectId={projectId}
          path={currentPath}
          onNavigate={handleNavigate}
          onTokenExpired={() => setTokenExpired(true)}
        />
      )}
    </div>
  );
}
