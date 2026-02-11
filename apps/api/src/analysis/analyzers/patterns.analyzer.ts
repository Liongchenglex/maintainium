import { Injectable, Logger } from '@nestjs/common';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { FileRegistryEntry, Patterns } from '../analysis.interfaces';

@Injectable()
export class PatternsAnalyzer {
  private readonly logger = new Logger(PatternsAnalyzer.name);

  async analyze(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
  ): Promise<Patterns> {
    const authPattern = this.detectAuthPattern(fileRegistry);
    const errorHandling = this.detectErrorHandling(fileRegistry);
    const stateManagement = this.detectStateManagement(fileRegistry);
    const styling = await this.detectStyling(repoPath, fileRegistry);
    const testing = await this.detectTesting(repoPath);
    const namingConvention = this.detectNamingConvention(fileRegistry);

    return {
      authPattern,
      errorHandling,
      stateManagement,
      styling,
      testing,
      namingConvention,
    };
  }

  private detectAuthPattern(fileRegistry: FileRegistryEntry[]): string[] {
    const patterns: string[] = [];
    const authKeywords = [
      'AuthGuard', 'requireAuth', 'passport', 'jwt', 'session',
      'firebase-admin', 'auth0', 'clerk',
    ];

    for (const file of fileRegistry) {
      for (const keyword of authKeywords) {
        if (
          file.path.toLowerCase().includes('auth') ||
          file.imports.external.some((i) => i.includes(keyword.toLowerCase()))
        ) {
          if (!patterns.includes(file.path)) {
            patterns.push(file.path);
          }
          break;
        }
      }
    }

    return patterns;
  }

  private detectErrorHandling(fileRegistry: FileRegistryEntry[]): string[] {
    const patterns: string[] = [];

    for (const file of fileRegistry) {
      if (
        file.path.includes('.filter.') ||
        file.path.includes('error-boundary') ||
        file.path.includes('exception') ||
        file.exports.some((e) => e.name.includes('Exception') || e.name.includes('Filter'))
      ) {
        patterns.push(file.path);
      }
    }

    return patterns;
  }

  private detectStateManagement(fileRegistry: FileRegistryEntry[]): string[] {
    const detected: string[] = [];
    const stateLibs: Record<string, string> = {
      'zustand': 'zustand',
      'redux': 'redux',
      '@reduxjs/toolkit': 'redux-toolkit',
      'jotai': 'jotai',
      'recoil': 'recoil',
      'mobx': 'mobx',
      'valtio': 'valtio',
      '@tanstack/react-query': 'react-query',
    };

    for (const file of fileRegistry) {
      for (const [pkg, name] of Object.entries(stateLibs)) {
        if (file.imports.external.includes(pkg) && !detected.includes(name)) {
          detected.push(name);
        }
      }
    }

    // Check for React Context usage
    const hasContext = fileRegistry.some(
      (f) => f.path.includes('/context') || f.path.includes('Context'),
    );
    if (hasContext && !detected.includes('react-context')) {
      detected.push('react-context');
    }

    return detected;
  }

  private async detectStyling(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
  ): Promise<string[]> {
    const detected: string[] = [];

    // Tailwind
    if (await this.fileExists(join(repoPath, 'tailwind.config.ts')) ||
        await this.fileExists(join(repoPath, 'tailwind.config.js'))) {
      detected.push('tailwindcss');
    }

    // CSS Modules
    if (fileRegistry.some((f) => f.path.includes('.module.css') || f.path.includes('.module.scss'))) {
      detected.push('css-modules');
    }

    // Styled Components / Emotion
    const stylingLibs: Record<string, string> = {
      'styled-components': 'styled-components',
      '@emotion/react': 'emotion',
      '@emotion/styled': 'emotion',
    };

    for (const file of fileRegistry) {
      for (const [pkg, name] of Object.entries(stylingLibs)) {
        if (file.imports.external.includes(pkg) && !detected.includes(name)) {
          detected.push(name);
        }
      }
    }

    // Inline styles (React.CSSProperties)
    if (detected.length === 0) {
      const hasInlineStyles = fileRegistry.some(
        (f) => f.language === 'typescript' && f.path.includes('/components/'),
      );
      if (hasInlineStyles) {
        detected.push('inline-styles');
      }
    }

    return detected;
  }

  private async detectTesting(repoPath: string): Promise<string[]> {
    const detected: string[] = [];

    const testConfigs: Record<string, string> = {
      'jest.config.ts': 'jest',
      'jest.config.js': 'jest',
      'vitest.config.ts': 'vitest',
      'vitest.config.js': 'vitest',
      'cypress.config.ts': 'cypress',
      'cypress.config.js': 'cypress',
      'playwright.config.ts': 'playwright',
      '.mocharc.yml': 'mocha',
      '.mocharc.json': 'mocha',
    };

    for (const [file, tool] of Object.entries(testConfigs)) {
      if (await this.fileExists(join(repoPath, file))) {
        if (!detected.includes(tool)) {
          detected.push(tool);
        }
      }
    }

    return detected;
  }

  private detectNamingConvention(fileRegistry: FileRegistryEntry[]): string {
    const counts = { kebab: 0, camel: 0, pascal: 0, snake: 0 };

    for (const file of fileRegistry) {
      if (file.category === 'config' || file.category === 'documentation') continue;

      const name = file.path.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
      if (!name) continue;

      if (name.includes('-')) counts.kebab++;
      else if (name.includes('_')) counts.snake++;
      else if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) counts.pascal++;
      else counts.camel++;
    }

    const max = Math.max(counts.kebab, counts.camel, counts.pascal, counts.snake);
    if (max === counts.kebab) return 'kebab-case';
    if (max === counts.pascal) return 'PascalCase';
    if (max === counts.snake) return 'snake_case';
    return 'camelCase';
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
