import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { FileRegistryEntry, SecurityMetadata } from '../analysis.interfaces';

const SECRET_PATTERNS = [
  /sk_live_\w+/,
  /sk_test_\w+/,
  /AKIA[A-Z0-9]{16}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /gho_[a-zA-Z0-9]{36}/,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /-----BEGIN\s+CERTIFICATE-----/,
];

const SECRET_VARIABLE_NAMES = /(?:secret|key|token|password|credential|api_key|apikey)\s*[:=]\s*['"]/i;

@Injectable()
export class SecurityAnalyzer {
  private readonly logger = new Logger(SecurityAnalyzer.name);

  async analyze(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
  ): Promise<SecurityMetadata> {
    const authFiles: string[] = [];
    const inputHandlers: string[] = [];
    const dbInteractionFiles: string[] = [];
    const hardcodedSecrets: string[] = [];
    const corsConfig: string[] = [];
    const securityHeaders: string[] = [];

    const codeFiles = fileRegistry.filter(
      (f) => f.language === 'typescript' || f.language === 'javascript',
    );

    for (const file of codeFiles) {
      try {
        const content = await readFile(join(repoPath, file.path), 'utf-8');

        // Auth files
        if (this.isAuthFile(content, file)) {
          authFiles.push(file.path);
        }

        // Input handlers
        if (this.isInputHandler(content)) {
          inputHandlers.push(file.path);
        }

        // DB interaction
        if (this.isDbInteraction(content, file)) {
          dbInteractionFiles.push(file.path);
        }

        // Hardcoded secrets
        if (this.hasHardcodedSecrets(content)) {
          hardcodedSecrets.push(file.path);
        }

        // CORS
        if (this.hasCorsConfig(content)) {
          corsConfig.push(file.path);
        }

        // Security headers
        if (this.hasSecurityHeaders(content)) {
          securityHeaders.push(file.path);
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      authFiles,
      inputHandlers,
      dbInteractionFiles,
      hardcodedSecrets,
      corsConfig,
      securityHeaders,
    };
  }

  private isAuthFile(content: string, file: FileRegistryEntry): boolean {
    const authKeywords = [
      'AuthGuard', 'requireAuth', 'isAuthenticated',
      'jwt', 'passport', 'session',
      'verifyIdToken', 'verifyToken',
    ];

    return authKeywords.some((keyword) => content.includes(keyword)) ||
      file.path.toLowerCase().includes('/auth/');
  }

  private isInputHandler(content: string): boolean {
    return (
      content.includes('@Body()') ||
      content.includes('@Param(') ||
      content.includes('@Query(') ||
      content.includes('req.body') ||
      content.includes('req.params') ||
      content.includes('request.body')
    );
  }

  private isDbInteraction(content: string, file: FileRegistryEntry): boolean {
    const ormPackages = [
      'drizzle-orm', '@prisma/client', 'typeorm', 'sequelize',
      'mongoose', 'pg', 'mysql2', 'better-sqlite3',
    ];

    return ormPackages.some((pkg) => file.imports.external.includes(pkg)) ||
      content.includes('.query(') ||
      content.includes('.execute(') ||
      content.includes('SELECT ') ||
      content.includes('INSERT ') ||
      content.includes('UPDATE ') ||
      content.includes('DELETE FROM');
  }

  private hasHardcodedSecrets(content: string): boolean {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) return true;
    }

    // Check for variable names that suggest secrets with hardcoded values
    // Exclude .env files, .example files, and type definitions
    if (SECRET_VARIABLE_NAMES.test(content)) {
      // Check if it's an actual assignment (not just a type or env reference)
      const lines = content.split('\n');
      for (const line of lines) {
        if (SECRET_VARIABLE_NAMES.test(line) &&
            !line.includes('process.env') &&
            !line.includes('configService') &&
            !line.includes('ConfigService') &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*')) {
          return true;
        }
      }
    }

    return false;
  }

  private hasCorsConfig(content: string): boolean {
    return (
      content.includes('cors(') ||
      content.includes('@nestjs/cors') ||
      content.includes('enableCors') ||
      content.includes('Access-Control-Allow-Origin')
    );
  }

  private hasSecurityHeaders(content: string): boolean {
    return (
      content.includes('helmet(') ||
      content.includes('helmet()') ||
      content.includes('Content-Security-Policy') ||
      content.includes('Strict-Transport-Security') ||
      content.includes('X-Frame-Options')
    );
  }
}
