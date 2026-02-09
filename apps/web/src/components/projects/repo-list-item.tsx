'use client';

interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatarUrl: string;
  private: boolean;
  description: string | null;
  language: string | null;
  defaultBranch: string;
  visibility: string;
  pushedAt: string | null;
  connected: boolean;
}

interface RepoListItemProps {
  repo: GitHubRepoItem;
  onSelect: (repo: GitHubRepoItem) => void;
  isLoading: boolean;
}

export type { GitHubRepoItem };

export function RepoListItem({ repo, onSelect, isLoading }: RepoListItemProps) {
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #f0f0f0',
  };

  const infoStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    flex: 1,
    minWidth: 0,
  };

  const nameStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: '0.95rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  const metaStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.75rem',
    fontSize: '0.8rem',
    color: '#666',
  };

  const badgeStyle: React.CSSProperties = {
    padding: '0.15rem 0.5rem',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: 500,
    border: '1px solid',
  };

  const privateBadge: React.CSSProperties = {
    ...badgeStyle,
    color: '#7c4dff',
    borderColor: '#e0d4ff',
    backgroundColor: '#f5f0ff',
  };

  const publicBadge: React.CSSProperties = {
    ...badgeStyle,
    color: '#2e7d32',
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8e9',
  };

  const connectedBadge: React.CSSProperties = {
    ...badgeStyle,
    color: '#1565c0',
    borderColor: '#bbdefb',
    backgroundColor: '#e3f2fd',
  };

  const connectBtnStyle: React.CSSProperties = {
    padding: '0.4rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    background: '#111',
    color: '#fff',
    fontSize: '0.85rem',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    opacity: isLoading ? 0.6 : 1,
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div style={rowStyle}>
      <div style={infoStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={nameStyle}>{repo.fullName}</span>
          <span style={repo.private ? privateBadge : publicBadge}>
            {repo.private ? 'Private' : 'Public'}
          </span>
        </div>
        <div style={metaStyle}>
          {repo.language && <span>{repo.language}</span>}
          {repo.pushedAt && <span>Updated {formatDate(repo.pushedAt)}</span>}
        </div>
      </div>
      <div>
        {repo.connected ? (
          <span style={connectedBadge}>Connected</span>
        ) : (
          <button
            style={connectBtnStyle}
            onClick={() => onSelect(repo)}
            disabled={isLoading}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
