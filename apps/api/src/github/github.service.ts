import { Injectable } from '@nestjs/common';
import {
  GitHubUser,
  GitHubRepo,
  GitHubTreeEntry,
  GitHubFileContent,
  GitHubWebhook,
} from './github.interfaces';
import {
  GitHubTokenExpiredError,
  GitHubRateLimitError,
  GitHubSsoRequiredError,
} from './github.errors';

const GITHUB_API = 'https://api.github.com';

@Injectable()
export class GitHubService {
  private async request<T>(
    token: string,
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${GITHUB_API}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      throw new GitHubTokenExpiredError();
    }

    if (response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const reset = Number(response.headers.get('x-ratelimit-reset'));
        throw new GitHubRateLimitError(reset);
      }

      const body = (await response.json().catch(() => ({}))) as Record<string, string>;
      if (
        body.message?.includes('SSO') ||
        body.message?.includes('organization')
      ) {
        throw new GitHubSsoRequiredError();
      }

      throw new Error(`GitHub API forbidden: ${body.message || response.statusText}`);
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<string, string>;
      throw new Error(
        `GitHub API error ${response.status}: ${body.message || response.statusText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async getAuthenticatedUser(token: string): Promise<GitHubUser> {
    return this.request<GitHubUser>(token, '/user');
  }

  async listRepositories(
    token: string,
    page = 1,
    perPage = 30,
  ): Promise<GitHubRepo[]> {
    return this.request<GitHubRepo[]>(
      token,
      `/user/repos?sort=pushed&direction=desc&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`,
    );
  }

  async searchRepositories(
    token: string,
    query: string,
    page = 1,
    perPage = 30,
  ): Promise<GitHubRepo[]> {
    const result = await this.request<{ items: GitHubRepo[] }>(
      token,
      `/search/repositories?q=${encodeURIComponent(query)}+in:name&sort=updated&per_page=${perPage}&page=${page}`,
    );
    return result.items;
  }

  async getRepository(
    token: string,
    owner: string,
    repo: string,
  ): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(token, `/repos/${owner}/${repo}`);
  }

  async getTree(
    token: string,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<GitHubTreeEntry[]> {
    const result = await this.request<{ tree: GitHubTreeEntry[] }>(
      token,
      `/repos/${owner}/${repo}/git/trees/${sha}`,
    );
    return result.tree;
  }

  async getFileContent(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHubFileContent> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    return this.request<GitHubFileContent>(
      token,
      `/repos/${owner}/${repo}/contents/${path}${query}`,
    );
  }

  async createWebhook(
    token: string,
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string,
  ): Promise<GitHubWebhook> {
    return this.request<GitHubWebhook>(
      token,
      `/repos/${owner}/${repo}/hooks`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'web',
          active: true,
          events: ['push'],
          config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
          },
        }),
      },
    );
  }

  async deleteWebhook(
    token: string,
    owner: string,
    repo: string,
    hookId: number,
  ): Promise<void> {
    await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks/${hookId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
  }
}
