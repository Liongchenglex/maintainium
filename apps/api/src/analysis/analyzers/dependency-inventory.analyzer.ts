import { Injectable, Logger } from '@nestjs/common';
import { readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { DependencyInventoryEntry } from '../analysis.interfaces';

const FRAMEWORK_CRITICAL = new Set([
  'react', 'react-dom', 'next', 'vue', 'nuxt', 'angular', '@angular/core',
  'express', '@nestjs/core', '@nestjs/common', 'fastify', 'koa', 'hono',
  'drizzle-orm', 'prisma', '@prisma/client', 'typeorm', 'sequelize', 'mongoose',
  'pg', 'mysql2', 'better-sqlite3', 'redis', 'ioredis',
  'firebase', 'firebase-admin',
  'svelte', '@sveltejs/kit', 'gatsby', 'remix', '@remix-run/node',
  'tailwindcss', 'styled-components', '@emotion/react',
]);

@Injectable()
export class DependencyInventoryAnalyzer {
  private readonly logger = new Logger(DependencyInventoryAnalyzer.name);

  async analyze(repoPath: string): Promise<DependencyInventoryEntry[]> {
    const deps = new Map<string, DependencyInventoryEntry>();

    const pkgJsonPaths = await this.findPackageJsons(repoPath);

    for (const pkgPath of pkgJsonPaths) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as Record<string, unknown>;

        const directDeps = pkg.dependencies as Record<string, string> | undefined;
        const devDeps = pkg.devDependencies as Record<string, string> | undefined;

        if (directDeps) {
          for (const [name, version] of Object.entries(directDeps)) {
            if (!deps.has(name)) {
              deps.set(name, {
                name,
                currentVersion: this.cleanVersion(version),
                isDirect: true,
                isFrameworkCritical: FRAMEWORK_CRITICAL.has(name),
              });
            }
          }
        }

        if (devDeps) {
          for (const [name, version] of Object.entries(devDeps)) {
            if (!deps.has(name)) {
              deps.set(name, {
                name,
                currentVersion: this.cleanVersion(version),
                isDirect: true,
                isFrameworkCritical: FRAMEWORK_CRITICAL.has(name),
              });
            }
          }
        }
      } catch {
        this.logger.warn(`Failed to parse ${pkgPath}`);
      }
    }

    return Array.from(deps.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async findPackageJsons(repoPath: string): Promise<string[]> {
    const paths: string[] = [];

    // Root
    const rootPkg = join(repoPath, 'package.json');
    if (await this.fileExists(rootPkg)) {
      paths.push(rootPkg);
    }

    // Workspace packages
    const patterns = ['apps', 'packages', 'libs'];
    for (const dir of patterns) {
      try {
        const entries = await readdir(join(repoPath, dir));
        for (const entry of entries) {
          const pkgPath = join(repoPath, dir, entry, 'package.json');
          if (await this.fileExists(pkgPath)) {
            paths.push(pkgPath);
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    return paths;
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
