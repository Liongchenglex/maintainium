import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  FileRegistryEntry,
  DataModel,
  SchemaTable,
  SchemaColumn,
} from '../analysis.interfaces';

@Injectable()
export class DataModelAnalyzer {
  private readonly logger = new Logger(DataModelAnalyzer.name);

  async analyze(
    repoPath: string,
    fileRegistry: FileRegistryEntry[],
  ): Promise<DataModel> {
    const schemas: SchemaTable[] = [];

    const candidateFiles = fileRegistry.filter(
      (f) =>
        f.category === 'schema' ||
        f.imports.external.includes('drizzle-orm') ||
        f.imports.external.includes('drizzle-orm/pg-core') ||
        f.imports.external.includes('@prisma/client') ||
        f.imports.external.includes('typeorm') ||
        f.imports.external.includes('zod'),
    );

    for (const file of candidateFiles) {
      try {
        const content = await readFile(join(repoPath, file.path), 'utf-8');

        // Drizzle schemas
        schemas.push(...this.parseDrizzle(content, file.path));

        // TypeScript interfaces
        schemas.push(...this.parseInterfaces(content, file.path));

        // Zod schemas
        schemas.push(...this.parseZod(content, file.path));
      } catch {
        this.logger.warn(`Failed to parse data model in: ${file.path}`);
      }
    }

    // Prisma schema
    const prismaFile = fileRegistry.find((f) => f.path.endsWith('schema.prisma'));
    if (prismaFile) {
      try {
        const content = await readFile(join(repoPath, prismaFile.path), 'utf-8');
        schemas.push(...this.parsePrisma(content));
      } catch {
        this.logger.warn('Failed to parse Prisma schema');
      }
    }

    return { schemas };
  }

  private parseDrizzle(code: string, filePath: string): SchemaTable[] {
    const tables: SchemaTable[] = [];

    // Match pgTable('tableName', { ... })
    const tableMatches = code.matchAll(
      /(?:pg|mysql|sqlite)Table\s*\(\s*['"](\w+)['"]\s*,\s*\{([^}]+)\}/gs,
    );

    for (const match of tableMatches) {
      const tableName = match[1];
      const columnsBlock = match[2];
      const columns = this.parseDrizzleColumns(columnsBlock);

      tables.push({
        name: tableName,
        columns,
        source: 'drizzle',
      });
    }

    return tables;
  }

  private parseDrizzleColumns(block: string): SchemaColumn[] {
    const columns: SchemaColumn[] = [];

    // Match: columnName: type('column_name')
    const colMatches = block.matchAll(
      /(\w+)\s*:\s*(uuid|varchar|text|integer|boolean|timestamp|jsonb|serial|bigint|real|numeric|date|time|pgEnum)\s*\(/g,
    );

    for (const match of colMatches) {
      columns.push({
        name: match[1],
        type: match[2],
      });
    }

    // Also match enum references: columnName: enumName('column_name')
    const enumMatches = block.matchAll(
      /(\w+)\s*:\s*(\w+Enum)\s*\(/g,
    );

    for (const match of enumMatches) {
      columns.push({
        name: match[1],
        type: 'enum',
      });
    }

    return columns;
  }

  private parsePrisma(code: string): SchemaTable[] {
    const tables: SchemaTable[] = [];

    // Match model blocks
    const modelMatches = code.matchAll(
      /model\s+(\w+)\s*\{([^}]+)\}/gs,
    );

    for (const match of modelMatches) {
      const name = match[1];
      const body = match[2];
      const columns: SchemaColumn[] = [];

      const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('@@'));

      for (const line of lines) {
        const fieldMatch = line.match(/^(\w+)\s+(\w+)(\[\])?\s*/);
        if (fieldMatch) {
          columns.push({
            name: fieldMatch[1],
            type: fieldMatch[2] + (fieldMatch[3] || ''),
          });
        }
      }

      tables.push({ name, columns, source: 'prisma' });
    }

    return tables;
  }

  private parseInterfaces(code: string, filePath: string): SchemaTable[] {
    const tables: SchemaTable[] = [];

    // Only parse files in schema/model directories
    if (!filePath.includes('/schema/') &&
        !filePath.includes('/models/') &&
        !filePath.includes('/entities/')) {
      return tables;
    }

    // Match export interface blocks
    const interfaceMatches = code.matchAll(
      /export\s+interface\s+(\w+)\s*\{([^}]+)\}/gs,
    );

    for (const match of interfaceMatches) {
      const name = match[1];
      const body = match[2];
      const columns: SchemaColumn[] = [];

      const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));

      for (const line of lines) {
        const fieldMatch = line.match(/^(\w+)\??:\s*(.+?);?\s*$/);
        if (fieldMatch) {
          columns.push({
            name: fieldMatch[1],
            type: fieldMatch[2].trim(),
          });
        }
      }

      if (columns.length > 0) {
        tables.push({ name, columns, source: 'interface' });
      }
    }

    return tables;
  }

  private parseZod(code: string, filePath: string): SchemaTable[] {
    const tables: SchemaTable[] = [];

    // Match const schemaName = z.object({...})
    const zodMatches = code.matchAll(
      /(?:export\s+)?const\s+(\w+)\s*=\s*z\.object\s*\(\s*\{([^}]+)\}\s*\)/gs,
    );

    for (const match of zodMatches) {
      const name = match[1];
      const body = match[2];
      const columns: SchemaColumn[] = [];

      const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));

      for (const line of lines) {
        const fieldMatch = line.match(/^(\w+)\s*:\s*z\.(\w+)/);
        if (fieldMatch) {
          columns.push({
            name: fieldMatch[1],
            type: `z.${fieldMatch[2]}`,
          });
        }
      }

      if (columns.length > 0) {
        tables.push({ name, columns, source: 'zod' });
      }
    }

    return tables;
  }
}
