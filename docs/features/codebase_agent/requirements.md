# Codebase Intelligence Agent — Requirements

---

## 1. Context & Intent

### Who is this for?
The **Codebase Intelligence Agent** serves all other agents in the MaintainAI system. It is the shared knowledge layer that every downstream agent reads from:
- **Monitor Agent (M4)**: Needs dependency inventory, tech stack, and security metadata to detect issues
- **Implementation Agent (M6)**: Needs file registry, dependency graph, API surface, and data model to write context-aware fixes
- **Validation Agent**: Needs expected behavior, schemas, and test locations to verify fixes
- **Orchestrator**: Needs tech stack and component ownership to route tasks to the correct specialist

### Problem being solved
Without a pre-indexed codebase knowledge layer, every agent would re-parse the entire codebase from scratch for every task. This is slow, expensive, and produces inconsistent context. The Codebase Intelligence Agent extracts structured metadata once, keeps it updated incrementally, and serves it to all consumers as queryable JSONB data.

### Non-goals (explicitly out of scope)
- **Line-by-line code understanding**: The agent does NOT explain what every function does internally. File-level purpose + exports + imports is sufficient. When agents need deeper understanding, they read the specific files directly.
- **LLM-generated descriptions in M3**: Plain-language file purpose descriptions require LLM calls per file. Deferred to a later enhancement. M3 uses static analysis only.
- **CMS analysis**: WordPress/Shopify theme/plugin analysis is deferred past MVP (per milestones.md).
- **Cross-repository analysis**: Each project is analyzed independently.
- **Code execution or build**: The agent reads and parses files. It does not compile, build, or execute any code from the user's repository.

---

## 2. Actual Flow (End-to-End)

### Flow A: Initial Analysis (on project creation)

1. User connects a GitHub repository via `POST /projects` (M2)
2. `ProjectsService` creates the project record and emits a `project.created` event
3. `CodebaseAnalysisService` listens for the event, creates a `codebase_analyses` record with status `pending`
4. Analysis job starts asynchronously:
   a. Status transitions to `analyzing`
   b. Downloads the repository as a tarball via GitHub Archive API (`GET /repos/{owner}/{repo}/tarball/{ref}`) — **1 API call**
   c. Extracts tarball to a temporary directory on the server
   d. Runs all analysis passes (P0 → P1 → P2) on the local filesystem
   e. Stores results as JSONB in the `codebase_analyses` record
   f. Status transitions to `completed` (or `failed` on error)
   g. Cleans up temporary directory
5. User visits the project detail page and sees the Application Profile populated

### Flow B: Incremental Update (on push webhook)

1. GitHub sends a push webhook to `POST /webhooks/github` (M2)
2. `WebhooksService` verifies the HMAC signature and processes the event
3. `WebhooksService` emits a `project.pushed` event with the push payload (including changed file list)
4. `CodebaseAnalysisService` listens for the event:
   a. Downloads the updated tarball (full re-download for simplicity in M3)
   b. Re-runs analysis and overwrites the existing `codebase_analyses` record
   c. Updates `analyzedAt` timestamp
5. Project detail page reflects the updated analysis

### Flow C: Manual Re-scan

1. User clicks "Re-scan" button on the project detail page
2. Frontend sends `POST /projects/:id/analyze`
3. Backend emits a `project.rescan` event
4. Same analysis flow as Flow A step 4
5. User sees updated results after completion

---

## 3. Step-by-Step Behaviour (Deterministic)

### Repository Download

- Use GitHub Archive API: `GET /repos/{owner}/{repo}/tarball/{defaultBranch}`
- Authenticate with the user's stored GitHub OAuth token (decrypted via `EncryptionService`)
- If token is expired/revoked → fail with `GITHUB_TOKEN_EXPIRED`, set analysis status to `failed`
- If repo is not accessible (404/403) → fail with descriptive error, set analysis status to `failed`
- Extract tarball to a temporary directory under `os.tmpdir()/maintainium-analysis-{uuid}/`
- After analysis completes (success or failure) → delete the temporary directory

### Analysis Execution Order

Analysis runs in phase order. Each phase produces a JSONB output stored in the corresponding column. All phases use **static analysis only** (no LLM calls).

#### P0: Project-Level Metadata + Dependency Inventory + File-Level Metadata

These are required before M4 (Scanner) can function.

**Project-Level Metadata** — parsed from config files:
- Framework and version → `package.json` dependencies (next, react, express, nestjs, etc.)
- Language and version → `tsconfig.json` (target), `package.json` (engines), `.nvmrc`, `.python-version`
- Package manager → presence of `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`
- Monorepo structure → `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json` → list packages with paths
- Build tool → `vite.config.*`, `webpack.config.*`, `turbo.json`, `next.config.*`
- Deployment target → `vercel.json`, `netlify.toml`, `Dockerfile`, `fly.toml`, `render.yaml`, `.github/workflows/*.yml` (look for deploy steps)
- Environment variables → grep for `process.env.`, `import.meta.env.`, `os.environ` across all source files → extract variable names only (never values)
- Entry points → `package.json` main/bin fields, `src/main.ts`, `src/index.ts`, `app/layout.tsx`, `pages/_app.tsx`

**Dependency Inventory** — parsed from manifest and lockfile:
- Read `package.json` (and workspace package.json files for monorepos)
- For each dependency: name, current version (from lockfile for exact version), direct vs. transitive
- Latest version → **deferred to M4 Monitor Agent** (requires npm registry API calls, not part of static analysis)
- License → **deferred to M4** (requires registry lookup)
- CVE flag → **deferred to M4** (requires CVE database lookup)
- Framework-critical flag → mark if package name matches a known list: `react`, `next`, `vue`, `angular`, `express`, `nestjs`, `drizzle-orm`, `prisma`, `pg`, `mysql2`, `mongoose`, etc.

**File-Level Metadata** — per source file (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`, etc.):
- File path (relative to repo root)
- Language (inferred from extension)
- Size in bytes
- Category tag: `component`, `page`, `api-route`, `service`, `utility`, `config`, `test`, `migration`, `schema`, `documentation`, `static-asset`, `unknown`
  - Category inferred by path conventions: `src/components/` → component, `src/app/` or `pages/` → page, `src/api/` or `controllers/` → api-route, `*.test.*` or `*.spec.*` → test, `*.config.*` → config, `drizzle/` or `migrations/` → migration, `schema/` → schema
- Imports: list of internal file paths and external packages this file imports (parsed from `import` / `require` statements)
- Exports: list of exported names (functions, classes, types, constants) with export type (`default`, `named`)

#### P1: Dependency Graph + API Surface + Data Model

These are required before M6 (Implementation Agent) can function.

**Dependency Graph** — computed from File-Level Metadata imports:
- Internal dependency map: directed edges `{ source: fileA, target: fileB }`
- Blast radius per file: count of files that directly or transitively import this file (reverse dependency count)
- Circular dependency detection: identify cycles in the directed graph
- Orphan detection: files that are not imported by any other file AND are not entry points (dead code candidates)

**API Surface** — parsed from source files:
- NestJS: scan for `@Controller`, `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete` decorators → extract path, HTTP method, handler file, handler method name
- Express: scan for `app.get()`, `app.post()`, `router.get()`, etc. → extract path, method, handler file
- Next.js App Router: scan `app/**/route.ts` files → extract path from directory structure, exported HTTP methods (`GET`, `POST`, etc.)
- Next.js Pages Router: scan `pages/api/**/*.ts` files → extract path from file structure
- Auth detection per route: if handler uses `@UseGuards(AuthGuard)`, `requireAuth`, or similar patterns → mark as `auth: true`; otherwise `auth: unknown`
- External API calls: scan for `fetch(`, `axios.`, `got(`, `http.request` with URL string literals or template literals → extract service name and calling file

**Data Model** — parsed from schema/model files:
- Drizzle: scan for `pgTable(`, `mysqlTable(`, `sqliteTable(` → extract table name, columns with types and constraints
- Prisma: parse `schema.prisma` → extract models, fields, relations
- TypeORM: scan for `@Entity()`, `@Column()` decorators → extract entities and fields
- TypeScript interfaces/types: scan for `export interface` and `export type` in files tagged as `schema` or in common model directories → extract name and field names
- Validation schemas: scan for `z.object(` (Zod), `yup.object(` (Yup), `class-validator` decorators → extract schema name and field names

#### P2: Patterns & Conventions + Security Metadata + Content & Structure

These enhance analysis quality but are not blocking for M4 or M6.

**Patterns and Conventions** — detected from file structure and config:
- Auth pattern: which files/directories handle authentication (by path convention + decorator/middleware detection)
- Error handling: presence of global exception filters, error boundary components, try/catch patterns in handlers
- State management: detect imports of `zustand`, `redux`, `@reduxjs/toolkit`, `React.createContext`, `jotai`, `recoil`
- Styling approach: detect imports of `tailwindcss` (+ `tailwind.config`), CSS module imports (`*.module.css`), styled-components, emotion
- Testing setup: detect `jest.config.*`, `vitest.config.*`, `cypress.config.*`, `.mocharc.*`; scan for test file locations
- Naming conventions: analyze file names → report dominant pattern (kebab-case, camelCase, PascalCase); detect barrel exports (`index.ts` re-exports)

**Security-Relevant Metadata**:
- Auth/authz files: files containing `AuthGuard`, `requireAuth`, `middleware`, `session`, `jwt`, `passport` in imports or code
- User input handlers: API route files that accept `@Body()`, `@Param()`, `@Query()`, `req.body`, `req.params`
- Database interaction files: files that import from ORM packages or contain raw SQL strings
- Hardcoded secrets: regex scan for patterns like `sk_live_`, `AKIA`, `ghp_`, `-----BEGIN.*PRIVATE KEY-----`, long hex/base64 strings assigned to variables named `secret`, `key`, `token`, `password`
- CORS config: detect `cors()` middleware usage, `@nestjs/cors`, or CORS headers in config
- Security headers: detect `helmet()`, CSP configuration, HSTS headers

**Content and Structure**:
- Page/route tree: every user-facing URL derived from file-based routing (Next.js `app/` or `pages/`) or explicit route definitions
- Component hierarchy: top-level layouts → page components → shared components (derived from dependency graph + category tags)
- Middleware chain: ordered list of middleware/interceptors/guards that run before request handlers

---

## 4. Edge Cases

### Repository Download
- **Empty repository**: No files to analyze → analysis completes with empty/default values for all categories, status `completed`
- **Very large repository (>500MB tarball)**: Set a max download size of 500MB. If exceeded → fail with `REPO_TOO_LARGE` error, set status `failed`
- **Binary-heavy repository**: Skip binary files (images, compiled assets, fonts) during file-level analysis. Only analyze text-based source files.
- **Repository with no package.json**: Still analyze file structure, but project-level metadata and dependency inventory will be mostly empty. Flag as `no-manifest-detected`.

### File Parsing
- **Malformed source files**: If a file cannot be parsed (syntax errors, encoding issues) → skip that file, log a warning, continue with remaining files. Do not fail the entire analysis.
- **Extremely large single file (>1MB)**: Parse imports/exports only from the first 10,000 lines. Mark as `truncated: true`.
- **Symlinks**: Do not follow symlinks. Skip them.
- **Generated files** (`*.min.js`, `dist/`, `build/`, `node_modules/`): Exclude from analysis. Use `.gitignore` patterns + known generated directories.

### Concurrent Analysis
- **Multiple push events in rapid succession**: Only one analysis should run per project at a time. If an analysis is already `analyzing`, subsequent triggers should be queued or debounced (skip if one is already running, the running one will capture the latest state since it downloads fresh).
- **Manual re-scan while analysis is running**: Return 409 Conflict with message "Analysis already in progress".

### Monorepo
- **Monorepo with many packages**: Analyze each workspace package independently but store as a single analysis result with packages as a top-level array in `projectMetadata`.
- **Shared dependencies across workspace packages**: Dependency inventory includes all packages across all workspace manifests, deduplicated.

---

## 5. Failure Modes

| Scenario | Status Code | Error | Analysis Status | Behavior |
|---|---|---|---|---|
| GitHub token expired/revoked | — | `GITHUB_TOKEN_EXPIRED` | `failed` | Analysis stops. Project detail shows "Reconnect GitHub" prompt. |
| Repository not accessible (404/403) | — | `REPO_NOT_ACCESSIBLE` | `failed` | Analysis stops. Project detail shows error message. |
| Tarball download timeout (>60s) | — | `DOWNLOAD_TIMEOUT` | `failed` | Analysis stops. User can retry via Re-scan. |
| Tarball exceeds 500MB | — | `REPO_TOO_LARGE` | `failed` | Analysis stops. Error message shown with size limit. |
| Temporary directory creation fails | — | `DISK_ERROR` | `failed` | Analysis stops. Server-side error logged. |
| Individual file parse failure | — | — | `completed` (partial) | File skipped with warning. Analysis continues. Partial results stored. |
| Analysis already running for project | 409 | `ANALYSIS_IN_PROGRESS` | — | Re-scan request rejected. |
| Unauthorized (no auth token) | 401 | `Missing or invalid authorization header` | — | API rejects the request. |
| Project not found or user not a member | 403 | `Forbidden` | — | API rejects the request. |

---

## 6. Acceptance Criteria

### P0: Project-Level Metadata + Dependency Inventory + File-Level Metadata

- **AC-P0-1**: Given a newly connected GitHub repository, when the project is created, then a codebase analysis is automatically triggered (no manual action required).
- **AC-P0-2**: Given a connected repository, when the analysis completes, then `codebase_analyses.status` is `completed` and `projectMetadata` JSONB contains: framework name and version, language, package manager, monorepo structure (if applicable), build tool, deployment target, environment variable names, and entry points.
- **AC-P0-3**: Given a repository with `package.json`, when the analysis completes, then `dependencyInventory` JSONB contains every direct dependency with: name, current version, and `frameworkCritical` flag.
- **AC-P0-4**: Given a repository with source files, when the analysis completes, then `fileRegistry` JSONB contains an entry for every non-excluded source file with: path, language, size, category tag, imports list, and exports list.
- **AC-P0-5**: Given a repository, when the analysis runs, then files in `node_modules/`, `dist/`, `build/`, `.git/`, and `.gitignore`-matched paths are excluded from file registry.
- **AC-P0-6**: Given a connected repository, when a push webhook is received, then the analysis is re-triggered and results are updated.
- **AC-P0-7**: Given a project detail page, when the user clicks "Re-scan", then a new analysis is triggered and status is shown to the user.
- **AC-P0-8**: Given an analysis that fails (token expired, download error), then `codebase_analyses.status` is `failed` with an error message, and the project detail page shows the error with appropriate action (e.g., "Reconnect GitHub").

### P1: Dependency Graph + API Surface + Data Model

- **AC-P1-1**: Given a completed analysis, when `dependencyGraph` is queried, then it contains directed edges for every internal import relationship between source files.
- **AC-P1-2**: Given a file in the dependency graph, when its blast radius is computed, then it returns the count of files that directly or transitively depend on it.
- **AC-P1-3**: Given a codebase with circular imports, then `dependencyGraph.circularDependencies` contains the detected cycles.
- **AC-P1-4**: Given a codebase with orphan files (no importers, not entry points), then `dependencyGraph.orphans` lists those files.
- **AC-P1-5**: Given a NestJS or Express backend, when the analysis completes, then `apiSurface.routes` contains every detected route with: path, HTTP method, handler file, and auth status.
- **AC-P1-6**: Given a codebase using Drizzle, Prisma, or TypeORM, when the analysis completes, then `dataModel.schemas` contains every detected table/model with: name, columns/fields, and types.
- **AC-P1-7**: Given a codebase with external API calls (fetch/axios to third-party URLs), then `apiSurface.externalCalls` lists the service and calling file.

### P2: Patterns & Conventions + Security Metadata + Content & Structure

- **AC-P2-1**: Given a completed analysis, then `patterns` JSONB contains detected: auth pattern, error handling approach, state management library, styling approach, testing framework, and naming convention.
- **AC-P2-2**: Given a codebase with hardcoded secret patterns (e.g., `sk_live_`, `AKIA`), then `securityMetadata.hardcodedSecrets` flags the file paths (no values exposed).
- **AC-P2-3**: Given a Next.js or file-based routing app, then `contentStructure.pageTree` contains every user-facing URL path.
- **AC-P2-4**: Given a codebase with middleware/guards, then `contentStructure.middlewareChain` lists the middleware in execution order.

### Cross-cutting

- **AC-X-1**: Given a repository tarball >500MB, when download is attempted, then the analysis fails with `REPO_TOO_LARGE` and does not consume excessive disk space.
- **AC-X-2**: Given a malformed source file, when analysis runs, then the file is skipped and remaining files are analyzed successfully.
- **AC-X-3**: Given an analysis already in progress for a project, when a re-scan is requested, then the API returns 409 Conflict.
- **AC-X-4**: Given a completed analysis, then the temporary directory used for extraction is deleted.

---

## 7. Open Questions / Assumptions

### Resolved

| # | Question | Resolution |
|---|---|---|
| 1 | LLM or static analysis for M3? | **Static analysis only**. LLM-generated file descriptions deferred to a later enhancement. |
| 2 | Execution model? | **Event-driven background jobs** via `@nestjs/event-emitter`. Analysis runs asynchronously after project creation, push webhook, or manual re-scan. |
| 3 | Storage model? | **Single `codebase_analyses` table** with JSONB columns per category. PostgreSQL JSONB operators for querying. |
| 4 | How to download the repo? | **GitHub Archive API** (`GET /repos/{owner}/{repo}/tarball/{ref}`) — 1 API call for the entire repo. Avoids rate limit issues. |
| 5 | Incremental vs full re-analysis on push? | **Full re-download and re-analysis for M3** (simplicity). Incremental diff-based updates are a future optimization. |
| 6 | Latest version / license / CVE lookups? | **Deferred to M4 (Monitor Agent)**. These require external API calls (npm registry, CVE databases) and belong in the scanning/detection layer. |
| 7 | Documentation storage: repo branch or DB? | **DB only** (JSONB in PostgreSQL). No documentation branch in the user's repo. |
| 8 | Git history for change frequency? | **Deferred to P2 enhancement**. Tarball download doesn't include git history. Would require `git clone --shallow` which adds complexity. |

### Assumptions

- The GitHub OAuth token stored in M2 has sufficient permissions to download the repository tarball (covered by `repo` scope).
- The server has sufficient temporary disk space for tarball extraction (max 500MB compressed → ~2GB extracted for very large repos).
- Analysis for a typical repository (< 10,000 files) completes within 5 minutes (per milestone criteria).
- `@nestjs/event-emitter` is sufficient for M3's async processing needs. If reliability requirements increase (guaranteed delivery, retry on crash), a proper job queue (`@nestjs/bull` + Redis) should be adopted.

---

## 8. Phased Execution Tracker

### P0: Core Metadata (blocks M4 — Scanner)

| # | Deliverable | Status |
|---|---|---|
| P0.1 | `codebase_analyses` table with JSONB columns | Pending |
| P0.2 | `@nestjs/event-emitter` integration + event wiring | Pending |
| P0.3 | GitHub tarball download + temp directory management | Pending |
| P0.4 | Project-Level Metadata analyzer | Pending |
| P0.5 | Dependency Inventory analyzer | Pending |
| P0.6 | File-Level Metadata analyzer (imports, exports, categories) | Pending |
| P0.7 | `POST /projects/:id/analyze` endpoint (manual re-scan) | Pending |
| P0.8 | Webhook integration (re-analysis on push) | Pending |
| P0.9 | Analysis status on project detail page (analyzing/completed/failed) | Pending |

### P1: Structural Intelligence (blocks M6 — Implementation Agent)

| # | Deliverable | Status |
|---|---|---|
| P1.1 | Dependency Graph builder (edges, blast radius, cycles, orphans) | Pending |
| P1.2 | API Surface analyzer (routes, methods, auth, external calls) | Pending |
| P1.3 | Data Model analyzer (ORM schemas, interfaces, validation) | Pending |

### P2: Quality & Security Metadata (enhances agent accuracy)

| # | Deliverable | Status |
|---|---|---|
| P2.1 | Patterns & Conventions detector | Pending |
| P2.2 | Security-Relevant Metadata scanner | Pending |
| P2.3 | Content & Structure mapper (page tree, middleware chain) | Pending |

### Future Enhancements (not in M3)

| # | Enhancement | Depends On |
|---|---|---|
| F1 | LLM-generated file purpose descriptions | LLM API integration |
| F2 | Incremental diff-based re-analysis (only changed files) | GitHub Compare API |
| F3 | Git history analysis (change frequency, churn detection) | `git clone --shallow` |
| F4 | User annotation/correction of analysis results | UI for editing metadata |
| F5 | Large codebase optimization (500k+ LOC streaming) | Performance profiling |

---

## 9. Data Model

### `codebase_analyses` Table

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Analysis record ID |
| `project_id` | UUID (FK → projects) | Associated project, unique constraint |
| `status` | enum: `pending`, `analyzing`, `completed`, `failed` | Current analysis state |
| `error_message` | text (nullable) | Error details if status is `failed` |
| `project_metadata` | JSONB (nullable) | Tech stack, framework, package manager, etc. |
| `file_registry` | JSONB (nullable) | Array of file entries with imports/exports |
| `dependency_graph` | JSONB (nullable) | Edges, blast radius, cycles, orphans |
| `dependency_inventory` | JSONB (nullable) | Array of packages with versions |
| `api_surface` | JSONB (nullable) | Routes, external calls |
| `data_model` | JSONB (nullable) | Schemas, interfaces, validation |
| `patterns` | JSONB (nullable) | Detected conventions |
| `security_metadata` | JSONB (nullable) | Auth files, input handlers, secrets |
| `content_structure` | JSONB (nullable) | Page tree, middleware chain |
| `analyzed_at` | timestamp (nullable) | When analysis last completed |
| `analysis_duration_ms` | integer (nullable) | How long the analysis took |
| `version` | integer (default 1) | Schema version for forward compatibility |
| `created_at` | timestamp | Record creation |
| `updated_at` | timestamp | Last modification |

### JSONB Schemas (key structures)

**`projectMetadata`**:
```json
{
  "frameworks": [{ "name": "next", "version": "15.5.12" }],
  "language": { "name": "typescript", "version": "5.3" },
  "packageManager": "pnpm",
  "monorepo": { "tool": "turbo", "packages": [{ "name": "@app/api", "path": "apps/api" }] },
  "buildTool": "turbo",
  "deploymentTargets": ["vercel"],
  "envVariables": ["DATABASE_URL", "FIREBASE_PROJECT_ID"],
  "entryPoints": ["apps/api/src/main.ts", "apps/web/src/app/layout.tsx"]
}
```

**`fileRegistry`** (array):
```json
[{
  "path": "apps/api/src/auth/auth.guard.ts",
  "language": "typescript",
  "sizeBytes": 1234,
  "category": "service",
  "imports": {
    "internal": ["apps/api/src/auth/firebase-admin.service.ts"],
    "external": ["@nestjs/common", "@nestjs/core"]
  },
  "exports": [{ "name": "AuthGuard", "type": "named", "kind": "class" }]
}]
```

**`dependencyGraph`**:
```json
{
  "edges": [{ "source": "src/auth/auth.guard.ts", "target": "src/auth/firebase-admin.service.ts" }],
  "blastRadius": { "src/database/schema/index.ts": 24 },
  "circularDependencies": [["src/a.ts", "src/b.ts", "src/a.ts"]],
  "orphans": ["src/utils/deprecated-helper.ts"]
}
```

**`dependencyInventory`** (array):
```json
[{
  "name": "@nestjs/core",
  "currentVersion": "10.3.0",
  "isDirect": true,
  "isFrameworkCritical": true
}]
```

**`apiSurface`**:
```json
{
  "routes": [{
    "path": "/users/me",
    "method": "GET",
    "handlerFile": "src/users/users.controller.ts",
    "handlerMethod": "getMe",
    "auth": true
  }],
  "externalCalls": [{
    "service": "github",
    "url": "https://api.github.com",
    "callerFile": "src/github/github.service.ts"
  }]
}
```
