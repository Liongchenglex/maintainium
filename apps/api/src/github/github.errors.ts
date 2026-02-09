export class GitHubTokenExpiredError extends Error {
  constructor(message = 'GitHub token is expired or revoked') {
    super(message);
    this.name = 'GitHubTokenExpiredError';
  }
}

export class GitHubRateLimitError extends Error {
  public readonly resetAt: Date;

  constructor(resetTimestamp: number) {
    const resetAt = new Date(resetTimestamp * 1000);
    super(`GitHub API rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = 'GitHubRateLimitError';
    this.resetAt = resetAt;
  }
}

export class GitHubSsoRequiredError extends Error {
  constructor(
    message = 'GitHub organization requires SSO authentication',
  ) {
    super(message);
    this.name = 'GitHubSsoRequiredError';
  }
}
