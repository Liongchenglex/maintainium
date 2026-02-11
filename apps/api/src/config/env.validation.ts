export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = [
    'DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'ENCRYPTION_KEY',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
  ];

  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  // Optional: LLM configuration (analysis works without these, LLM phases are skipped)
  // LLM_API_KEY, LLM_PROVIDER (default: anthropic), LLM_MODEL (default: claude-sonnet-4-5-20250929)

  return config;
}
