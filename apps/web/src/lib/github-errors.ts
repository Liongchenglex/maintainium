const GITHUB_ERROR_MAP: Record<string, string> = {
  GITHUB_TOKEN_EXPIRED:
    'Your GitHub connection has expired. Please reconnect your GitHub account.',
  GITHUB_RATE_LIMIT:
    'GitHub API rate limit reached. Please wait a few minutes and try again.',
  GITHUB_SSO_REQUIRED:
    'This organization requires SSO authentication. Please authenticate via your organization first.',
};

const DEFAULT_MESSAGE = 'An unexpected error occurred. Please try again.';

export function getGitHubErrorMessage(code: string | undefined): string {
  if (!code) return DEFAULT_MESSAGE;
  return GITHUB_ERROR_MAP[code] || DEFAULT_MESSAGE;
}
