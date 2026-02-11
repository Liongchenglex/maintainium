import { Injectable, Logger } from '@nestjs/common';
import { readFile, readdir, stat, access } from 'fs/promises';
import { join, relative, extname, dirname, resolve } from 'path';
import { FileRegistryEntry, FileCategory, ExportEntry } from '../analysis.interfaces';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', 'coverage',
  '__pycache__', '.turbo', '.cache', '.output', 'vendor',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx',
  '.css', '.scss', '.less',
  '.html', '.vue', '.svelte',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.avi',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx',
  '.exe', '.dll', '.so', '.dylib',
  '.wasm',
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const MAX_PARSE_LINES = 10000;

@Injectable()
export class FileRegistryAnalyzer {
  private readonly logger = new Logger(FileRegistryAnalyzer.name);

  async analyze(repoPath: string): Promise<FileRegistryEntry[]> {
    const files: FileRegistryEntry[] = [];
    await this.walkDirectory(repoPath, repoPath, files);
    return files;
  }

  private async walkDirectory(
    basePath: string,
    currentPath: string,
    files: FileRegistryEntry[],
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(currentPath, entry.name);

      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, files);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();

      // Skip binary files
      if (BINARY_EXTENSIONS.has(ext)) continue;

      // Skip files without recognized extensions
      if (!SOURCE_EXTENSIONS.has(ext) && !entry.name.startsWith('.')) continue;

      // Skip minified files
      if (entry.name.endsWith('.min.js') || entry.name.endsWith('.min.css')) continue;

      try {
        const fileStat = await stat(fullPath);
        const relativePath = relative(basePath, fullPath);
        const language = this.inferLanguage(ext);
        const category = this.inferCategory(relativePath, entry.name);

        let imports = { internal: [] as string[], external: [] as string[] };
        let exports: ExportEntry[] = [];

        // Parse imports/exports for code files
        if (this.isCodeFile(ext) && fileStat.size <= MAX_FILE_SIZE) {
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n').slice(0, MAX_PARSE_LINES);
          const code = lines.join('\n');

          imports = this.parseImports(code, relativePath);
          exports = this.parseExports(code);
        }

        files.push({
          path: relativePath,
          language,
          sizeBytes: fileStat.size,
          category,
          imports,
          exports,
          llm: null,
        });
      } catch {
        this.logger.warn(`Failed to process file: ${fullPath}`);
      }
    }
  }

  private inferLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.py': 'python', '.go': 'go', '.rs': 'rust',
      '.java': 'java', '.rb': 'ruby', '.php': 'php',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
      '.md': 'markdown', '.mdx': 'markdown',
      '.css': 'css', '.scss': 'scss', '.less': 'less',
      '.html': 'html', '.vue': 'vue', '.svelte': 'svelte',
    };
    return map[ext] || 'unknown';
  }

  private inferCategory(relativePath: string, fileName: string): FileCategory {
    const lower = relativePath.toLowerCase();
    const name = fileName.toLowerCase();

    // Tests
    if (name.includes('.test.') || name.includes('.spec.') ||
        lower.includes('__tests__') || lower.includes('/test/') ||
        lower.includes('/tests/')) {
      return 'test';
    }

    // Config files
    if (name.includes('.config.') || name === 'tsconfig.json' ||
        name === 'package.json' || name === '.eslintrc.js' ||
        name === '.prettierrc' || name === 'drizzle.config.ts' ||
        name === 'nest-cli.json' || name === 'next.config.mjs' ||
        name === 'next.config.ts' || name === 'tailwind.config.ts' ||
        name === 'turbo.json') {
      return 'config';
    }

    // Migrations
    if (lower.includes('/migrations/') || lower.includes('/drizzle/') ||
        lower.includes('/migrate/')) {
      return 'migration';
    }

    // Schema
    if (lower.includes('/schema/') || lower.includes('/schemas/') ||
        lower.includes('/models/') || lower.includes('/entities/') ||
        name === 'schema.prisma') {
      return 'schema';
    }

    // Documentation
    if (name.endsWith('.md') || name.endsWith('.mdx') ||
        lower.includes('/docs/') || lower.includes('/documentation/')) {
      return 'documentation';
    }

    // Static assets
    if (lower.includes('/public/') || lower.includes('/static/') ||
        lower.includes('/assets/')) {
      return 'static-asset';
    }

    // Middleware / guards / interceptors
    if (name.includes('.guard.') || name.includes('.middleware.') ||
        name.includes('.interceptor.') || name.includes('.filter.') ||
        lower.includes('/middleware/') || lower.includes('/guards/')) {
      return 'middleware';
    }

    // API routes
    if (name.includes('.controller.') || lower.includes('/controllers/') ||
        lower.includes('/api/') || name === 'route.ts' || name === 'route.js') {
      return 'api-route';
    }

    // Services
    if (name.includes('.service.') || lower.includes('/services/')) {
      return 'service';
    }

    // Pages
    if (lower.includes('/pages/') ||
        (lower.includes('/app/') && (name === 'page.tsx' || name === 'page.ts' ||
         name === 'layout.tsx' || name === 'layout.ts'))) {
      return 'page';
    }

    // Components
    if (lower.includes('/components/') || lower.includes('/component/')) {
      return 'component';
    }

    // Utilities
    if (lower.includes('/utils/') || lower.includes('/helpers/') ||
        lower.includes('/lib/') || lower.includes('/shared/') ||
        name.includes('.util.') || name.includes('.helper.')) {
      return 'utility';
    }

    return 'unknown';
  }

  private parseImports(
    code: string,
    filePath: string,
  ): { internal: string[]; external: string[] } {
    const internal: string[] = [];
    const external: string[] = [];

    // ES import: import ... from '...'
    const esImports = code.matchAll(
      /import\s+(?:(?:[\w{},\s*]+)\s+from\s+)?['"]([^'"]+)['"]/g,
    );
    for (const match of esImports) {
      this.classifyImport(match[1], filePath, internal, external);
    }

    // Dynamic import: import('...')
    const dynamicImports = code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of dynamicImports) {
      this.classifyImport(match[1], filePath, internal, external);
    }

    // CommonJS require: require('...')
    const requires = code.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const match of requires) {
      this.classifyImport(match[1], filePath, internal, external);
    }

    return {
      internal: [...new Set(internal)],
      external: [...new Set(external)],
    };
  }

  private classifyImport(
    importPath: string,
    filePath: string,
    internal: string[],
    external: string[],
  ): void {
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      // Resolve relative import to absolute path relative to repo root
      const fileDir = dirname(filePath);
      let resolved = resolve('/', fileDir, importPath).slice(1); // Remove leading /

      // Try common extensions if not specified
      if (!extname(resolved)) {
        resolved = resolved; // Keep as-is, we don't know the actual extension
      }

      internal.push(resolved);
    } else {
      // Package import — extract package name
      const parts = importPath.split('/');
      const pkgName = importPath.startsWith('@')
        ? `${parts[0]}/${parts[1]}`
        : parts[0];
      external.push(pkgName);
    }
  }

  private parseExports(code: string): ExportEntry[] {
    const exports: ExportEntry[] = [];

    // export default
    const defaultExport = code.match(
      /export\s+default\s+(function|class|const|abstract\s+class)\s+(\w+)/,
    );
    if (defaultExport) {
      exports.push({
        name: defaultExport[2],
        type: 'default',
        kind: this.classifyExportKind(defaultExport[1]),
      });
    } else if (/export\s+default\s/.test(code)) {
      exports.push({ name: 'default', type: 'default', kind: 'unknown' });
    }

    // Named exports: export const/function/class/type/interface/enum
    const namedExports = code.matchAll(
      /export\s+(const|let|var|function|class|abstract\s+class|type|interface|enum)\s+(\w+)/g,
    );
    for (const match of namedExports) {
      exports.push({
        name: match[2],
        type: 'named',
        kind: this.classifyExportKind(match[1]),
      });
    }

    return exports;
  }

  private classifyExportKind(
    keyword: string,
  ): ExportEntry['kind'] {
    if (keyword === 'function') return 'function';
    if (keyword === 'class' || keyword === 'abstract class') return 'class';
    if (keyword === 'type') return 'type';
    if (keyword === 'interface') return 'interface';
    if (keyword === 'const' || keyword === 'let' || keyword === 'var') return 'const';
    if (keyword === 'enum') return 'enum';
    return 'unknown';
  }

  private isCodeFile(ext: string): boolean {
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.vue', '.svelte'].includes(ext);
  }
}
