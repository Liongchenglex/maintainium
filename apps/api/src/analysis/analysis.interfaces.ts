// ── Event Payloads ──

export interface ProjectCreatedPayload {
  projectId: string;
  userId: string;
}

export interface ProjectPushedPayload {
  projectId: string;
}

// ── Project Metadata ──

export interface FrameworkInfo {
  name: string;
  version: string | null;
}

export interface MonorepoPackage {
  name: string;
  path: string;
}

export interface ProjectMetadata {
  frameworks: FrameworkInfo[];
  language: { name: string; version: string | null };
  packageManager: string | null;
  monorepo: { tool: string; packages: MonorepoPackage[] } | null;
  buildTool: string | null;
  deploymentTargets: string[];
  envVariables: string[];
  entryPoints: string[];
}

// ── Dependency Inventory ──

export interface DependencyInventoryEntry {
  name: string;
  currentVersion: string;
  isDirect: boolean;
  isFrameworkCritical: boolean;
}

// ── File Registry ──

export type FileCategory =
  | 'component'
  | 'page'
  | 'api-route'
  | 'service'
  | 'utility'
  | 'config'
  | 'test'
  | 'migration'
  | 'schema'
  | 'documentation'
  | 'static-asset'
  | 'middleware'
  | 'unknown';

export interface ExportEntry {
  name: string;
  type: 'default' | 'named';
  kind: 'function' | 'class' | 'type' | 'interface' | 'const' | 'enum' | 'unknown';
}

export interface FileLlmResult {
  purpose: string;
  businessContext: string;
  feature: string;
  functions: { name: string; description: string }[];
}

export interface FileRegistryEntry {
  path: string;
  language: string;
  sizeBytes: number;
  category: FileCategory;
  imports: {
    internal: string[];
    external: string[];
  };
  exports: ExportEntry[];
  llm: FileLlmResult | null;
}

// ── Dependency Graph ──

export interface DependencyEdge {
  source: string;
  target: string;
}

export interface DependencyGraph {
  edges: DependencyEdge[];
  blastRadius: Record<string, number>;
  circularDependencies: string[][];
  orphans: string[];
}

// ── API Surface ──

export interface ApiRoute {
  path: string;
  method: string;
  handlerFile: string;
  handlerMethod: string;
  auth: boolean | 'unknown';
}

export interface ExternalApiCall {
  service: string;
  url: string;
  callerFile: string;
}

export interface ApiSurface {
  routes: ApiRoute[];
  externalCalls: ExternalApiCall[];
}

// ── Data Model ──

export interface SchemaColumn {
  name: string;
  type: string;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  source: 'drizzle' | 'prisma' | 'typeorm' | 'interface' | 'zod';
}

export interface DataModel {
  schemas: SchemaTable[];
}

// ── Patterns ──

export interface Patterns {
  authPattern: string[];
  errorHandling: string[];
  stateManagement: string[];
  styling: string[];
  testing: string[];
  namingConvention: string;
}

// ── Security Metadata ──

export interface SecurityMetadata {
  authFiles: string[];
  inputHandlers: string[];
  dbInteractionFiles: string[];
  hardcodedSecrets: string[];
  corsConfig: string[];
  securityHeaders: string[];
}

// ── Content Structure ──

export interface PageTreeEntry {
  path: string;
  filePath: string;
}

export interface ContentStructure {
  pageTree: PageTreeEntry[];
  componentHierarchy: { file: string; children: string[] }[];
  middlewareChain: string[];
}

// ── LLM Intelligence ──

export interface BusinessFlow {
  name: string;
  description: string;
  files: string[];
}

export interface LlmIntelligence {
  architectureSummary: string;
  businessFlows: BusinessFlow[];
  techStackNarrative: string;
}
