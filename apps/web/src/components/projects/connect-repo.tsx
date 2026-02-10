'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { get, post, ApiError } from '@/lib/api';
import { RepoListItem, GitHubRepoItem } from './repo-list-item';

export function ConnectRepo() {
  const { user, dbUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<GitHubRepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);

  const checkGithubStatus = useCallback(async () => {
    try {
      const status = await get<{ connected: boolean; githubUsername: string | null }>(
        '/users/me/github-status',
      );
      setGithubConnected(status.connected);
      return status.connected;
    } catch {
      setGithubConnected(false);
      return false;
    }
  }, []);

  const fetchRepos = useCallback(
    async (searchQuery: string, pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          per_page: '30',
        });
        if (searchQuery) params.set('search', searchQuery);

        const data = await get<GitHubRepoItem[]>(
          `/projects/repos?${params.toString()}`,
        );
        setRepos(data);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'GITHUB_TOKEN_EXPIRED') {
          setTokenExpired(true);
        }
        setError(err instanceof Error ? err.message : 'Failed to load repositories');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const init = async () => {
      const connected = await checkGithubStatus();
      if (connected) {
        await fetchRepos('', 1);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [checkGithubStatus, fetchRepos]);

  // Handle OAuth redirect callback
  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      setGithubConnected(true);
      fetchRepos('', 1);
    }
  }, [searchParams, fetchRepos]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setPage(1);
      fetchRepos(value, 1);
    },
    [fetchRepos],
  );

  const handleNextPage = useCallback(() => {
    const next = page + 1;
    setPage(next);
    fetchRepos(search, next);
  }, [page, search, fetchRepos]);

  const handlePrevPage = useCallback(() => {
    const prev = Math.max(1, page - 1);
    setPage(prev);
    fetchRepos(search, prev);
  }, [page, search, fetchRepos]);

  const handleConnect = useCallback(
    async (repo: GitHubRepoItem) => {
      setConnecting(true);
      setError(null);
      try {
        await post('/projects', {
          githubRepoId: repo.id,
          owner: repo.owner,
          repo: repo.name,
        });
        router.push('/dashboard');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to connect repository',
        );
        setConnecting(false);
      }
    },
    [router],
  );

  const handleConnectGithub = async () => {
    try {
      const { url } = await get<{ url: string }>('/github/oauth/initiate');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start GitHub connection');
    }
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '700px',
    margin: '2rem auto',
    padding: '0 1rem',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
  };

  const descStyle: React.CSSProperties = {
    color: '#666',
    marginBottom: '1.5rem',
  };

  const searchStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    fontSize: '0.95rem',
    marginBottom: '1rem',
    boxSizing: 'border-box',
  };

  const connectGithubBtnStyle: React.CSSProperties = {
    padding: '0.75rem 1.5rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    background: '#24292e',
    color: '#fff',
    fontSize: '0.95rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const paginationStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 0',
    marginTop: '0.5rem',
  };

  const pageBtnStyle: React.CSSProperties = {
    padding: '0.4rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
    background: 'transparent',
    fontSize: '0.85rem',
    cursor: 'pointer',
  };

  const errorStyle: React.CSSProperties = {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    backgroundColor: '#fff3f3',
    border: '1px solid #ffc7c7',
    color: '#c62828',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  };

  const repoListStyle: React.CSSProperties = {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
  };

  // GitHub not connected — show connect prompt
  if (githubConnected === false) {
    return (
      <div style={containerStyle}>
        <h1 style={headingStyle}>Connect Repository</h1>
        <p style={descStyle}>
          Connect your GitHub account to import repositories.
        </p>
        {error && <div style={errorStyle}>{error}</div>}
        {dbUser?.authProvider === 'github' ? (
          <p style={{ color: '#666' }}>
            Your GitHub token was not captured during sign-in. Please sign out and sign in with GitHub again.
          </p>
        ) : (
          <button onClick={handleConnectGithub} style={connectGithubBtnStyle}>
            Connect GitHub
          </button>
        )}
      </div>
    );
  }

  // Loading initial state
  if (githubConnected === null) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#666' }}>Loading...</p>
      </div>
    );
  }

  // GitHub connected — show repo list
  return (
    <div style={containerStyle}>
      <h1 style={headingStyle}>Connect Repository</h1>
      <p style={descStyle}>
        Select a repository to add to your workspace.
      </p>

      {error && <div style={errorStyle}>{error}</div>}

      {tokenExpired && (
        <div style={{ marginBottom: '1rem' }}>
          {dbUser?.authProvider === 'github' ? (
            <p style={{ color: '#666', fontSize: '0.9rem' }}>
              Please sign out and sign in with GitHub again to refresh your token.
            </p>
          ) : (
            <button onClick={handleConnectGithub} style={connectGithubBtnStyle}>
              Reconnect GitHub
            </button>
          )}
        </div>
      )}

      <input
        type="text"
        placeholder="Search repositories..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        style={searchStyle}
      />

      {loading ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
          Loading repositories...
        </p>
      ) : repos.length === 0 ? (
        <p style={{ color: '#666', textAlign: 'center', padding: '2rem' }}>
          No repositories found.
        </p>
      ) : (
        <>
          <div style={repoListStyle}>
            {repos.map((repo) => (
              <RepoListItem
                key={repo.id}
                repo={repo}
                onSelect={handleConnect}
                isLoading={connecting}
              />
            ))}
          </div>

          <div style={paginationStyle}>
            <button
              onClick={handlePrevPage}
              disabled={page <= 1}
              style={{
                ...pageBtnStyle,
                opacity: page <= 1 ? 0.5 : 1,
                cursor: page <= 1 ? 'default' : 'pointer',
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: '0.85rem', color: '#666' }}>
              Page {page}
            </span>
            <button
              onClick={handleNextPage}
              disabled={repos.length < 30}
              style={{
                ...pageBtnStyle,
                opacity: repos.length < 30 ? 0.5 : 1,
                cursor: repos.length < 30 ? 'default' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
