export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  email: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  visibility: string;
  pushed_at: string | null;
  updated_at: string | null;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: string;
  content: string;
}

export interface GitHubWebhook {
  id: number;
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type: string;
  };
}
