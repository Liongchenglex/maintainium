// ── Types ──

export interface InvestigationData {
  diagnosis: {
    summary: string;
    rootCause: string;
    impact: string;
    confidence: 'high' | 'medium' | 'low';
  };
  proposal: {
    strategy: string;
    estimatedEffort: string;
    files: Array<{
      path: string;
      action: 'modify' | 'create' | 'delete';
      description: string;
    }>;
  };
  changes: Array<{
    filePath: string;
    language: string;
    hunks: Array<{
      header: string;
      lines: Array<{ type: 'context' | 'add' | 'remove'; content: string }>;
    }>;
  }>;
  testScope: Array<{
    category: string;
    items: string[];
  }>;
}

interface FindingInput {
  scanner: string;
  title: string;
  description: string;
  severity: string;
  details: Record<string, unknown> | null;
}

// ── Generator ──

export function generateMockInvestigation(finding: FindingInput): InvestigationData {
  const generator = SCANNER_GENERATORS[finding.scanner] ?? generateFallback;
  return generator(finding);
}

// ── Scanner-Specific Generators ──

type Generator = (finding: FindingInput) => InvestigationData;

const SCANNER_GENERATORS: Record<string, Generator> = {
  's1-cve': generateCve,
  's2-freshness': generateFreshness,
  's3-secrets': generateSecrets,
  's4-auth-coverage': generateAuthCoverage,
  's5-code-health': generateCodeHealth,
  's6-env-exposure': generateEnvExposure,
  's7-uptime': generateUptime,
  's7a-ssl': generateSsl,
};

function generateCve(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const pkg = (d.package as string) || 'unknown-package';
  const currentVersion = (d.currentVersion as string) || '1.0.0';
  const patchedVersion = (d.patchedVersion as string) || '1.0.1';
  const cveId = (d.cveId as string) || 'CVE-XXXX-XXXXX';

  return {
    diagnosis: {
      summary: `${pkg}@${currentVersion} is affected by ${cveId}.`,
      rootCause: `The installed version of ${pkg} contains a known vulnerability (${cveId}) that was patched in version ${patchedVersion}.`,
      impact: `${finding.severity === 'critical' ? 'Remote code execution or data exfiltration possible.' : 'Potential denial of service or information disclosure.'}`,
      confidence: 'high',
    },
    proposal: {
      strategy: `Bump ${pkg} from ${currentVersion} to ${patchedVersion}. Run tests to verify no breaking changes.`,
      estimatedEffort: '15 minutes',
      files: [
        { path: 'package.json', action: 'modify', description: `Update ${pkg} version` },
      ],
    },
    changes: [
      {
        filePath: 'package.json',
        language: 'json',
        hunks: [
          {
            header: '@@ dependencies @@',
            lines: [
              { type: 'context', content: '  "dependencies": {' },
              { type: 'remove', content: `    "${pkg}": "${currentVersion}",` },
              { type: 'add', content: `    "${pkg}": "${patchedVersion}",` },
              { type: 'context', content: '    ...' },
              { type: 'context', content: '  }' },
            ],
          },
        ],
      },
    ],
    testScope: [
      { category: 'Regression', items: ['Run full test suite', `Verify ${pkg} API compatibility`] },
      { category: 'Security', items: [`Confirm ${cveId} no longer flagged by audit`] },
    ],
  };
}

function generateFreshness(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const pkg = (d.package as string) || 'unknown-package';
  const currentVersion = (d.currentVersion as string) || '1.0.0';
  const latestVersion = (d.latestVersion as string) || '2.0.0';

  return {
    diagnosis: {
      summary: `${pkg}@${currentVersion} is outdated. Latest is ${latestVersion}.`,
      rootCause: `The dependency has not been updated and is behind by one or more major versions, missing bug fixes and security patches.`,
      impact: 'Outdated dependencies accumulate technical debt and may miss critical patches.',
      confidence: 'high',
    },
    proposal: {
      strategy: `Update ${pkg} to ${latestVersion}. Review changelog for breaking changes before merging.`,
      estimatedEffort: '30 minutes',
      files: [
        { path: 'package.json', action: 'modify', description: `Bump ${pkg} version` },
      ],
    },
    changes: [
      {
        filePath: 'package.json',
        language: 'json',
        hunks: [
          {
            header: '@@ dependencies @@',
            lines: [
              { type: 'context', content: '  "dependencies": {' },
              { type: 'remove', content: `    "${pkg}": "^${currentVersion}",` },
              { type: 'add', content: `    "${pkg}": "^${latestVersion}",` },
              { type: 'context', content: '  }' },
            ],
          },
        ],
      },
    ],
    testScope: [
      { category: 'Regression', items: ['Run full test suite', `Check ${pkg} changelog for breaking changes`] },
      { category: 'Integration', items: [`Verify ${pkg} works with current Node.js version`] },
    ],
  };
}

function generateSecrets(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const file = (d.file as string) || 'src/config.ts';
  const secretType = (d.secretType as string) || 'API key';
  const line = (d.line as number) || 12;
  const varName = secretType.toUpperCase().replace(/[\s-]/g, '_');

  return {
    diagnosis: {
      summary: `Hardcoded ${secretType} found in ${file} at line ${line}.`,
      rootCause: `A secret value was committed directly into source code rather than being loaded from environment variables.`,
      impact: 'Exposed credentials can be harvested from version history even after removal, leading to unauthorized access.',
      confidence: 'high',
    },
    proposal: {
      strategy: `Replace the hardcoded value with an environment variable reference. Add the variable to .env.example. Rotate the exposed credential.`,
      estimatedEffort: '20 minutes',
      files: [
        { path: file, action: 'modify', description: `Replace hardcoded ${secretType} with env var` },
        { path: '.env.example', action: 'modify', description: `Add ${varName} placeholder` },
      ],
    },
    changes: [
      {
        filePath: file,
        language: 'typescript',
        hunks: [
          {
            header: `@@ -${line},3 +${line},3 @@`,
            lines: [
              { type: 'context', content: '// Configuration' },
              { type: 'remove', content: `const secret = "sk-xxxxxxxxxxxxxxxxxxxx";` },
              { type: 'add', content: `const secret = process.env.${varName};` },
              { type: 'context', content: '' },
            ],
          },
        ],
      },
      {
        filePath: '.env.example',
        language: 'bash',
        hunks: [
          {
            header: '@@ environment variables @@',
            lines: [
              { type: 'context', content: '# Secrets' },
              { type: 'add', content: `${varName}=your-${secretType.toLowerCase().replace(/\s/g, '-')}-here` },
            ],
          },
        ],
      },
    ],
    testScope: [
      { category: 'Security', items: ['Verify secret is no longer in source', `Rotate the exposed ${secretType}`] },
      { category: 'Deployment', items: [`Ensure ${varName} is set in all deployment environments`] },
    ],
  };
}

function generateAuthCoverage(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const route = (d.route as string) || '/api/resource';
  const method = (d.method as string) || 'GET';
  const file = (d.file as string) || 'src/controllers/resource.controller.ts';

  return {
    diagnosis: {
      summary: `${method} ${route} has no authentication guard.`,
      rootCause: `The route handler is missing an auth decorator or guard, allowing unauthenticated access.`,
      impact: 'Unprotected endpoints may expose sensitive data or allow unauthorized mutations.',
      confidence: 'medium',
    },
    proposal: {
      strategy: `Add the authentication guard to the route handler. Verify the route requires auth by design (not a public endpoint).`,
      estimatedEffort: '10 minutes',
      files: [
        { path: file, action: 'modify', description: 'Add auth guard to route handler' },
      ],
    },
    changes: [
      {
        filePath: file,
        language: 'typescript',
        hunks: [
          {
            header: '@@ route handler @@',
            lines: [
              { type: 'context', content: `  @${method === 'GET' ? 'Get' : 'Post'}('${route.split('/').pop()}')` },
              { type: 'add', content: '  @UseGuards(AuthGuard)' },
              { type: 'context', content: `  async handle(@CurrentUser() user: UserRecord) {` },
              { type: 'context', content: '    // ...' },
              { type: 'context', content: '  }' },
            ],
          },
        ],
      },
    ],
    testScope: [
      { category: 'Auth', items: [`Verify ${method} ${route} returns 401 without token`, `Verify ${method} ${route} succeeds with valid token`] },
      { category: 'Regression', items: ['Ensure no other routes were affected'] },
    ],
  };
}

function generateCodeHealth(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const issueType = (d.type as string) || 'orphan';
  const file = (d.file as string) || 'src/utils/deprecated.ts';

  if (issueType === 'circular') {
    const moduleA = (d.moduleA as string) || 'src/services/a.ts';
    const moduleB = (d.moduleB as string) || 'src/services/b.ts';

    return {
      diagnosis: {
        summary: `Circular dependency detected between ${moduleA} and ${moduleB}.`,
        rootCause: `Both modules import from each other, creating a dependency cycle that can cause runtime issues and makes the code harder to reason about.`,
        impact: 'Circular dependencies may cause undefined imports at runtime and increase coupling.',
        confidence: 'medium',
      },
      proposal: {
        strategy: `Extract shared logic into a new module that both can import from, breaking the cycle.`,
        estimatedEffort: '1 hour',
        files: [
          { path: moduleA, action: 'modify', description: 'Remove import from module B' },
          { path: moduleB, action: 'modify', description: 'Remove import from module A' },
          { path: 'src/services/shared.ts', action: 'create', description: 'Extract shared types/functions' },
        ],
      },
      changes: [
        {
          filePath: 'src/services/shared.ts',
          language: 'typescript',
          hunks: [
            {
              header: '@@ new file @@',
              lines: [
                { type: 'add', content: '// Shared types extracted to break circular dependency' },
                { type: 'add', content: 'export interface SharedConfig {' },
                { type: 'add', content: '  // ... moved from module A/B' },
                { type: 'add', content: '}' },
              ],
            },
          ],
        },
      ],
      testScope: [
        { category: 'Build', items: ['Verify no circular dependency warnings', 'Check all imports resolve'] },
        { category: 'Regression', items: ['Run full test suite'] },
      ],
    };
  }

  // Default: orphan file
  return {
    diagnosis: {
      summary: `Orphan file detected: ${file} has no imports.`,
      rootCause: `The file is not imported by any other module in the project, suggesting it is unused dead code.`,
      impact: 'Dead code increases bundle size and maintenance burden.',
      confidence: 'low',
    },
    proposal: {
      strategy: `Verify the file is truly unused (not dynamically imported or referenced in config), then delete it.`,
      estimatedEffort: '10 minutes',
      files: [
        { path: file, action: 'delete', description: 'Remove orphan file' },
      ],
    },
    changes: [
      {
        filePath: file,
        language: 'typescript',
        hunks: [
          {
            header: '@@ entire file @@',
            lines: [
              { type: 'remove', content: '// This file is no longer referenced' },
              { type: 'remove', content: 'export function deprecated() {' },
              { type: 'remove', content: '  // ...' },
              { type: 'remove', content: '}' },
            ],
          },
        ],
      },
    ],
    testScope: [
      { category: 'Build', items: ['Verify project compiles without the file', 'Check no runtime errors'] },
    ],
  };
}

function generateEnvExposure(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const varName = (d.variable as string) || 'DATABASE_URL';
  const file = (d.file as string) || 'src/config/env.ts';

  return {
    diagnosis: {
      summary: `${varName} is exposed to client-side code.`,
      rootCause: `The environment variable is referenced in client-accessible code or uses a NEXT_PUBLIC_ prefix inappropriately, making it visible in the browser.`,
      impact: 'Server-only configuration (database URLs, API keys) exposed to users via the browser.',
      confidence: 'high',
    },
    proposal: {
      strategy: `Move the variable reference to server-only code. Remove any NEXT_PUBLIC_ prefix if it should be server-only.`,
      estimatedEffort: '15 minutes',
      files: [
        { path: file, action: 'modify', description: `Move ${varName} to server-side only` },
      ],
    },
    changes: [
      {
        filePath: file,
        language: 'typescript',
        hunks: [
          {
            header: '@@ config @@',
            lines: [
              { type: 'context', content: '// Environment configuration' },
              { type: 'remove', content: `export const dbUrl = process.env.NEXT_PUBLIC_${varName};` },
              { type: 'add', content: `// Server-only: do not expose to client` },
              { type: 'add', content: `export const dbUrl = process.env.${varName};` },
              { type: 'context', content: '' },
            ],
          },
        ],
      },
    ],
    testScope: [
      { category: 'Security', items: [`Verify ${varName} is not in client bundle`, 'Check browser network tab for leaked values'] },
      { category: 'Regression', items: ['Verify server-side code still reads the variable correctly'] },
    ],
  };
}

function generateUptime(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const url = (d.url as string) || 'https://example.com';
  const statusCode = (d.statusCode as number) || 503;

  return {
    diagnosis: {
      summary: `Production endpoint returned HTTP ${statusCode}.`,
      rootCause: `The production URL ${url} is returning a non-2xx status code, indicating the service is down or degraded.`,
      impact: 'Users cannot access the application. Revenue and trust impact proportional to downtime duration.',
      confidence: 'high',
    },
    proposal: {
      strategy: `This is an infrastructure issue. Check server logs, hosting provider status page, and recent deployments for root cause.`,
      estimatedEffort: 'Varies',
      files: [],
    },
    changes: [],
    testScope: [
      { category: 'Infrastructure', items: ['Check server/container logs', 'Verify hosting provider status', 'Review recent deployments'] },
      { category: 'Monitoring', items: ['Confirm uptime recovery after fix', 'Verify alerting is configured'] },
    ],
  };
}

function generateSsl(finding: FindingInput): InvestigationData {
  const d = finding.details ?? {};
  const issue = (d.issue as string) || 'Certificate expires soon';
  const daysLeft = (d.daysUntilExpiry as number) || 7;

  return {
    diagnosis: {
      summary: `SSL/TLS issue: ${issue}.`,
      rootCause: `The SSL certificate has ${daysLeft} days until expiry. If it expires, browsers will show security warnings and block access.`,
      impact: 'An expired certificate will prevent all HTTPS traffic and display security warnings to users.',
      confidence: 'high',
    },
    proposal: {
      strategy: `Renew the SSL certificate. If using Let's Encrypt or similar, verify auto-renewal is configured. This is an infrastructure-level fix.`,
      estimatedEffort: '15 minutes',
      files: [],
    },
    changes: [],
    testScope: [
      { category: 'Infrastructure', items: ['Renew SSL certificate', 'Verify auto-renewal configuration'] },
      { category: 'Validation', items: ['Confirm certificate validity after renewal', 'Test HTTPS connection from browser'] },
    ],
  };
}

function generateFallback(finding: FindingInput): InvestigationData {
  return {
    diagnosis: {
      summary: finding.title,
      rootCause: finding.description,
      impact: `Severity: ${finding.severity}. Review the finding details for specific impact assessment.`,
      confidence: 'low',
    },
    proposal: {
      strategy: 'Manual investigation required. Review the finding details and determine the appropriate remediation.',
      estimatedEffort: 'Varies',
      files: [],
    },
    changes: [],
    testScope: [
      { category: 'General', items: ['Verify the issue is resolved', 'Run relevant test suite'] },
    ],
  };
}
