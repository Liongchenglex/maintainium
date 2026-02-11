import { Injectable, Logger } from '@nestjs/common';
import { readFile, access, readdir } from 'fs/promises';
import { join } from 'path';
import {
  ProjectMetadata,
  FrameworkInfo,
  MonorepoPackage,
} from '../analysis.interfaces';

const FRAMEWORK_DETECTORS: Record<string, string> = {
  next: 'next',
  react: 'react',
  'react-dom': 'react',
  vue: 'vue',
  nuxt: 'nuxt',
  '@angular/core': 'angular',
  express: 'express',
  '@nestjs/core': 'nestjs',
  fastify: 'fastify',
  koa: 'koa',
  'hono': 'hono',
  svelte: 'svelte',
  '@sveltejs/kit': 'sveltekit',
  'gatsby': 'gatsby',
  remix: 'remix',
  '@remix-run/node': 'remix',
};

const DEPLOYMENT_FILES: Record<string, string> = {
  'vercel.json': 'vercel',
  'netlify.toml': 'netlify',
  'Dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  'fly.toml': 'fly',
  'render.yaml': 'render',
  'railway.json': 'railway',
};

const BUILD_TOOL_FILES: Record<string, string> = {
  'vite.config.ts': 'vite',
  'vite.config.js': 'vite',
  'vite.config.mts': 'vite',
  'webpack.config.js': 'webpack',
  'webpack.config.ts': 'webpack',
  'turbo.json': 'turbo',
  'next.config.js': 'next',
  'next.config.mjs': 'next',
  'next.config.ts': 'next',
  'rollup.config.js': 'rollup',
  'esbuild.config.js': 'esbuild',
};

const ENTRY_POINT_PATHS = [
  'src/main.ts',
  'src/main.tsx',
  'src/index.ts',
  'src/index.tsx',
  'src/app.ts',
  'app/layout.tsx',
  'app/layout.ts',
  'pages/_app.tsx',
  'pages/_app.ts',
  'index.ts',
  'index.js',
  'server.ts',
  'server.js',
];

@Injectable()
export class ProjectMetadataAnalyzer {
  private readonly logger = new Logger(ProjectMetadataAnalyzer.name);

  async analyze(repoPath: string): Promise<ProjectMetadata> {
    const frameworks = await this.detectFrameworks(repoPath);
    const language = await this.detectLanguage(repoPath);
    const packageManager = await this.detectPackageManager(repoPath);
    const monorepo = await this.detectMonorepo(repoPath);
    const buildTool = await this.detectBuildTool(repoPath);
    const deploymentTargets = await this.detectDeploymentTargets(repoPath);
    const envVariables = await this.detectEnvVariables(repoPath);
    const entryPoints = await this.detectEntryPoints(repoPath, monorepo);

    return {
      frameworks,
      language,
      packageManager,
      monorepo,
      buildTool,
      deploymentTargets,
      envVariables,
      entryPoints,
    };
  }

  private async detectFrameworks(repoPath: string): Promise<FrameworkInfo[]> {
    const frameworks: FrameworkInfo[] = [];
    const pkgJsonPaths = await this.findPackageJsons(repoPath);

    for (const pkgPath of pkgJsonPaths) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, unknown>;
        const allDeps = {
          ...(pkg.dependencies as Record<string, string> || {}),
          ...(pkg.devDependencies as Record<string, string> || {}),
        };

        for (const [depName, framework] of Object.entries(FRAMEWORK_DETECTORS)) {
          if (allDeps[depName] && !frameworks.find((f) => f.name === framework)) {
            frameworks.push({
              name: framework,
              version: this.cleanVersion(allDeps[depName]),
            });
          }
        }
      } catch {
        // Skip malformed package.json
      }
    }

    return frameworks;
  }

  private async detectLanguage(repoPath: string): Promise<{ name: string; version: string | null }> {
    // Check tsconfig.json for TypeScript
    try {
      const tsconfig = JSON.parse(await readFile(join(repoPath, 'tsconfig.json'), 'utf-8')) as Record<string, unknown>;
      const compilerOptions = tsconfig.compilerOptions as Record<string, unknown> | undefined;
      return {
        name: 'typescript',
        version: compilerOptions?.target as string || null,
      };
    } catch {
      // No tsconfig — check for package.json
    }

    // Check for TypeScript in dependencies
    try {
      const pkg = JSON.parse(await readFile(join(repoPath, 'package.json'), 'utf-8')) as Record<string, unknown>;
      const devDeps = pkg.devDependencies as Record<string, string> || {};
      if (devDeps.typescript) {
        return { name: 'typescript', version: this.cleanVersion(devDeps.typescript) };
      }
    } catch {
      // No package.json
    }

    // Check for Python
    if (await this.fileExists(join(repoPath, 'requirements.txt')) ||
        await this.fileExists(join(repoPath, 'pyproject.toml'))) {
      return { name: 'python', version: null };
    }

    // Check for Go
    if (await this.fileExists(join(repoPath, 'go.mod'))) {
      return { name: 'go', version: null };
    }

    return { name: 'javascript', version: null };
  }

  private async detectPackageManager(repoPath: string): Promise<string | null> {
    if (await this.fileExists(join(repoPath, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await this.fileExists(join(repoPath, 'yarn.lock'))) return 'yarn';
    if (await this.fileExists(join(repoPath, 'bun.lockb'))) return 'bun';
    if (await this.fileExists(join(repoPath, 'package-lock.json'))) return 'npm';
    return null;
  }

  private async detectMonorepo(
    repoPath: string,
  ): Promise<{ tool: string; packages: MonorepoPackage[] } | null> {
    // pnpm workspaces
    if (await this.fileExists(join(repoPath, 'pnpm-workspace.yaml'))) {
      const packages = await this.findWorkspacePackages(repoPath);
      const tool = (await this.fileExists(join(repoPath, 'turbo.json')))
        ? 'turbo'
        : 'pnpm';
      return { tool, packages };
    }

    // Lerna
    if (await this.fileExists(join(repoPath, 'lerna.json'))) {
      const packages = await this.findWorkspacePackages(repoPath);
      return { tool: 'lerna', packages };
    }

    // Nx
    if (await this.fileExists(join(repoPath, 'nx.json'))) {
      const packages = await this.findWorkspacePackages(repoPath);
      return { tool: 'nx', packages };
    }

    // Yarn/npm workspaces via package.json
    try {
      const pkg = JSON.parse(await readFile(join(repoPath, 'package.json'), 'utf-8')) as Record<string, unknown>;
      if (pkg.workspaces) {
        const packages = await this.findWorkspacePackages(repoPath);
        return { tool: 'workspaces', packages };
      }
    } catch {
      // No package.json
    }

    return null;
  }

  private async detectBuildTool(repoPath: string): Promise<string | null> {
    for (const [file, tool] of Object.entries(BUILD_TOOL_FILES)) {
      if (await this.fileExists(join(repoPath, file))) {
        return tool;
      }
    }
    return null;
  }

  private async detectDeploymentTargets(repoPath: string): Promise<string[]> {
    const targets: string[] = [];

    for (const [file, target] of Object.entries(DEPLOYMENT_FILES)) {
      if (await this.fileExists(join(repoPath, file))) {
        if (!targets.includes(target)) {
          targets.push(target);
        }
      }
    }

    // Check for GitHub Actions deploy
    try {
      const workflowDir = join(repoPath, '.github', 'workflows');
      const files = await readdir(workflowDir);
      for (const f of files) {
        if (f.endsWith('.yml') || f.endsWith('.yaml')) {
          const content = await readFile(join(workflowDir, f), 'utf-8');
          if (content.includes('deploy') || content.includes('Deploy')) {
            if (!targets.includes('github-actions')) {
              targets.push('github-actions');
            }
            break;
          }
        }
      }
    } catch {
      // No workflows directory
    }

    return targets;
  }

  private async detectEnvVariables(repoPath: string): Promise<string[]> {
    const envVars = new Set<string>();
    const sourceFiles = await this.collectSourceFiles(repoPath);

    for (const filePath of sourceFiles) {
      try {
        const content = await readFile(filePath, 'utf-8');
        // process.env.VAR_NAME
        const processEnvMatches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
        for (const match of processEnvMatches) {
          envVars.add(match[1]);
        }
        // import.meta.env.VITE_VAR
        const metaEnvMatches = content.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g);
        for (const match of metaEnvMatches) {
          envVars.add(match[1]);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return Array.from(envVars).sort();
  }

  private async detectEntryPoints(
    repoPath: string,
    monorepo: { tool: string; packages: MonorepoPackage[] } | null,
  ): Promise<string[]> {
    const entryPoints: string[] = [];

    if (monorepo) {
      // Check entry points within each package
      for (const pkg of monorepo.packages) {
        for (const entry of ENTRY_POINT_PATHS) {
          const fullPath = join(repoPath, pkg.path, entry);
          if (await this.fileExists(fullPath)) {
            entryPoints.push(join(pkg.path, entry));
          }
        }
      }
    } else {
      // Check root-level entry points
      for (const entry of ENTRY_POINT_PATHS) {
        if (await this.fileExists(join(repoPath, entry))) {
          entryPoints.push(entry);
        }
      }
    }

    return entryPoints;
  }

  private async findWorkspacePackages(repoPath: string): Promise<MonorepoPackage[]> {
    const packages: MonorepoPackage[] = [];

    // Try common workspace paths
    const patterns = ['apps', 'packages', 'libs'];
    for (const dir of patterns) {
      try {
        const entries = await readdir(join(repoPath, dir));
        for (const entry of entries) {
          const pkgPath = join(repoPath, dir, entry, 'package.json');
          try {
            const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, string>;
            packages.push({
              name: pkg.name || entry,
              path: `${dir}/${entry}`,
            });
          } catch {
            // No package.json in this directory
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return packages;
  }

  private async findPackageJsons(repoPath: string): Promise<string[]> {
    const paths = [join(repoPath, 'package.json')];

    // Also check workspace packages
    const patterns = ['apps', 'packages', 'libs'];
    for (const dir of patterns) {
      try {
        const entries = await readdir(join(repoPath, dir));
        for (const entry of entries) {
          paths.push(join(repoPath, dir, entry, 'package.json'));
        }
      } catch {
        // Directory doesn't exist
      }
    }

    const validPaths: string[] = [];
    for (const p of paths) {
      if (await this.fileExists(p)) {
        validPaths.push(p);
      }
    }

    return validPaths;
  }

  private async collectSourceFiles(repoPath: string, maxFiles = 500): Promise<string[]> {
    const files: string[] = [];
    const queue = [repoPath];
    const skipDirs = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', '__pycache__']);

    while (queue.length > 0 && files.length < maxFiles) {
      const dir = queue.shift()!;
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (skipDirs.has(entry.name)) continue;
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            queue.push(fullPath);
          } else if (this.isSourceFile(entry.name)) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    return files;
  }

  private isSourceFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase();
    return ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'rb', 'php'].includes(ext || '');
  }

  private cleanVersion(version: string): string {
    return version.replace(/^[\^~>=<]*/g, '');
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
