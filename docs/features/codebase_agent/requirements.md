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
- **Comprehensive LLM analysis of all files**: LLM analysis is **selective** — only structurally important files (controllers, services, schemas, entry points, middleware) receive LLM-generated descriptions. Utility files, tests, config, and static assets are described by static analysis only.
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
   d. Runs static analysis passes (P0 → P1 static → P2) on the local filesystem
   e. Runs selective LLM analysis (P1 LLM) on important files identified by static analysis
   f. Stores results as JSONB in the `codebase_analyses` record
   g. Status transitions to `completed` (or `failed` on error)
   h. Cleans up temporary directory
5. User visits the project detail page and sees the Application Profile populated

### Flow B: Incremental Update (on push to default branch)

**Trigger:** A developer pushes code to the connected repository's **default branch** (e.g., `git push origin main` from their terminal, or a PR is merged into `main` on GitHub).

1. Developer pushes commits to the default branch of the connected GitHub repository
2. GitHub detects the push and sends a webhook `POST` to our API at `/webhooks/github` (webhook was registered during project creation in M2)
3. `WebhooksService` verifies the HMAC signature and identifies the project by `repository.id` in the payload
4. `WebhooksService` checks the push `ref` against the project's stored `githubDefaultBranch`:
   - If `ref` matches the default branch (e.g., `refs/heads/main`) → emit `project.pushed` event
   - If `ref` is a non-default branch (e.g., `refs/heads/feature/xyz`) → log and skip, no re-analysis triggered
5. `CodebaseAnalysisService` listens for the `project.pushed` event:
   a. Checks if an analysis is already running for this project → if yes, skip (debounce)
   b. Downloads the updated tarball (full re-download for simplicity in M3)
   c. Re-runs all analysis phases and overwrites the existing `codebase_analyses` record
   d. Updates `analyzedAt` timestamp
6. Next time the user visits the project detail page, they see the updated analysis results

**Note:** The developer does not need to be logged into MaintainAI or take any action in the dashboard. The webhook fires automatically from GitHub whenever code is pushed.

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

Analysis runs in phase order. Each phase produces a JSONB output stored in the corresponding column. P0 and P2 use **static analysis only**. P1 includes **selective LLM analysis** for structurally important files.

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

#### P1 (cont.): LLM Intelligence — Selective File Descriptions + Business Flow Map

This phase uses an LLM to generate plain-language understanding of key files and the overall application architecture. It runs **after** P0 completes (needs file registry and category tags to determine which files are "important"). It runs **after** P1 static analysis (needs dependency graph and API surface as context).

**File Selection Criteria** — only files matching these categories receive LLM analysis:
- `api-route` — controllers, route handlers
- `service` — business logic services
- `schema` — database schemas, ORM models
- `page` — top-level page components (not every nested component)
- `middleware` — auth guards, interceptors, middleware
- `config` — main configuration files (not every `.config.*`)
- Entry points identified in P0 `projectMetadata.entryPoints`
- Files with blast radius > 10 (high-impact files from P1 dependency graph)

**Excluded from LLM analysis**: `test`, `documentation`, `static-asset`, `unknown`, `utility` (unless blast radius > 10), `migration`, individual component files.

**Expected file count**: For a typical project (500 source files), approximately 20–50 files qualify for LLM analysis.

**Per-File LLM Analysis** — for each selected file, the LLM receives:
- File path and category tag
- File content (truncated to first 300 lines if larger)
- Imports and exports (from P0 file registry)
- API routes handled (from P1 API surface, if applicable)
- Data models defined (from P1 data model, if applicable)

The LLM produces per file:
- `purpose`: One-line plain-language description (e.g., "Handles GitHub OAuth callback, exchanges authorization code for access token, encrypts and stores the token")
- `businessContext`: What role this file plays in the application's business logic (e.g., "Part of the GitHub connection flow — this is the server-side callback that completes OAuth after GitHub redirects the user back")
- `keyBehaviors`: List of 2–5 key things this file does, described in plain language (e.g., ["Validates HMAC state parameter to prevent CSRF", "Exchanges OAuth code for GitHub access token", "Encrypts token via EncryptionService before storage", "Redirects user to frontend dashboard on success"])

**Project-Level LLM Analysis** — after all per-file analyses complete, a second LLM call produces:
- `architectureSummary`: 3–5 sentence overview of how the application is structured (e.g., "Turborepo monorepo with a NestJS API backend and Next.js frontend. Authentication uses Firebase Auth with a NestJS AuthGuard pattern. Data is stored in PostgreSQL via Drizzle ORM. GitHub integration uses OAuth App tokens for repository access.")
- `businessFlows`: List of major end-to-end flows detected, each with:
  - `name`: Flow name (e.g., "User Authentication")
  - `description`: Plain-language description of the flow
  - `files`: Ordered list of files involved in the flow (e.g., `[auth-context.tsx → auth.guard.ts → firebase-admin.service.ts → users.service.ts]`)
- `techStackNarrative`: Plain-language summary of the tech stack and key architectural decisions

**LLM Configuration**:
- Provider: configurable via `LLM_PROVIDER` env var (default: `anthropic`)
- Model: configurable via `LLM_MODEL` env var (default: `claude-sonnet-4-5-20250929`)
- API key: `LLM_API_KEY` env var
- Per-file calls are batched with concurrency limit (max 5 parallel calls) to manage rate limits
- Timeout per LLM call: 30 seconds
- If an individual file's LLM call fails → skip that file's LLM description, keep the static metadata, log warning
- If the project-level LLM call fails → skip `architectureSummary` and `businessFlows`, keep all other analysis results

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

### LLM Analysis
- **LLM API key not configured**: If `LLM_API_KEY` is not set → skip all LLM analysis phases, complete with static analysis only. Log a warning. Do not fail the entire analysis.
- **LLM rate limit hit**: If the LLM provider returns 429 → retry with exponential backoff (max 3 retries per call). If still failing → skip remaining LLM file descriptions, proceed with what was completed.
- **LLM returns low-quality or off-topic response**: No automated quality check in M3. Accept the response as-is. Quality improvements are a future enhancement.
- **File content too large for LLM context**: Truncate to first 300 lines before sending. Mark as `truncated: true` in the LLM input so the model knows context is partial.

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
| LLM API key not configured | — | — | `completed` (partial) | LLM phases skipped. Static analysis results stored. Warning logged. |
| LLM call fails for a single file | — | — | `completed` (partial) | That file's LLM description is null. All other results stored. |
| LLM call fails for project-level summary | — | — | `completed` (partial) | `architectureSummary` and `businessFlows` are null. All other results stored. |
| LLM rate limit (429) after retries | — | — | `completed` (partial) | Remaining LLM descriptions skipped. Partial LLM results stored. |
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

### P1 (cont.): LLM Intelligence

- **AC-P1-8**: Given a completed analysis with LLM enabled, then files with category `api-route`, `service`, `schema`, or `page` have a non-null `purpose` field containing a plain-language description.
- **AC-P1-9**: Given a completed analysis with LLM enabled, then `llmIntelligence.architectureSummary` contains a 3–5 sentence overview of the application architecture.
- **AC-P1-10**: Given a completed analysis with LLM enabled, then `llmIntelligence.businessFlows` contains at least one detected end-to-end flow with a name, description, and ordered list of involved files.
- **AC-P1-11**: Given an analysis where `LLM_API_KEY` is not set, then the analysis completes successfully with static analysis results only and LLM fields are null.
- **AC-P1-12**: Given a file whose LLM call fails, then the file retains its static metadata (path, imports, exports, category) and only the LLM fields (`purpose`, `businessContext`, `keyBehaviors`) are null.

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
- **AC-X-5**: Given an analysis with LLM enabled, then approximately 20–50 files (not all files) receive LLM-generated descriptions, selected by category and blast radius criteria.

---

## 7. Open Questions / Assumptions

### Resolved

| # | Question | Resolution |
|---|---|---|
| 1 | LLM or static analysis for M3? | **Both**. Static analysis for all files (P0). Selective LLM analysis for structurally important files only (~20-50 files per repo) in P1. LLM is non-blocking: if unavailable, analysis completes with static results only. |
| 2 | Execution model? | **Event-driven background jobs** via `@nestjs/event-emitter`. Analysis runs asynchronously after project creation, push webhook, or manual re-scan. |
| 3 | Storage model? | **Single `codebase_analyses` table** with JSONB columns per category. PostgreSQL JSONB operators for querying. |
| 4 | How to download the repo? | **GitHub Archive API** (`GET /repos/{owner}/{repo}/tarball/{ref}`) — 1 API call for the entire repo. Avoids rate limit issues. |
| 5 | Incremental vs full re-analysis on push? | **Full re-download and re-analysis for M3** (simplicity). Incremental diff-based updates are a future optimization. |
| 6 | Latest version / license / CVE lookups? | **Deferred to M4 (Monitor Agent)**. These require external API calls (npm registry, CVE databases) and belong in the scanning/detection layer. |
| 7 | Documentation storage: repo branch or DB? | **DB only** (JSONB in PostgreSQL). No documentation branch in the user's repo. |
| 8 | Git history for change frequency? | **Deferred to future enhancement**. Tarball download doesn't include git history. Would require `git clone --shallow` which adds complexity. |
| 9 | Which files get LLM analysis? | **Selective**: only structurally important files (controllers, services, schemas, entry points, middleware, high-blast-radius files). ~20-50 files for a typical repo. |
| 10 | Which LLM provider/model? | **Configurable** via env vars (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`). Default: Anthropic Claude Sonnet. |
| 11 | What if LLM is unavailable? | **Graceful degradation**. Analysis completes with static results only. LLM fields are null. No failure. |

### Assumptions

- The GitHub OAuth token stored in M2 has sufficient permissions to download the repository tarball (covered by `repo` scope).
- The server has sufficient temporary disk space for tarball extraction (max 500MB compressed → ~2GB extracted for very large repos).
- Analysis for a typical repository (< 10,000 files) completes within 5 minutes (per milestone criteria).
- `@nestjs/event-emitter` is sufficient for M3's async processing needs. If reliability requirements increase (guaranteed delivery, retry on crash), a proper job queue (`@nestjs/bull` + Redis) should be adopted.
- LLM cost per analysis is approximately $0.05–0.15 for selective analysis (~20-50 files at ~300 lines each using Claude Sonnet).
- LLM API key is provided by the platform operator (MaintainAI), not by the end user.

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

### P1: Structural + LLM Intelligence (blocks M6 — Implementation Agent)

| # | Deliverable | Status |
|---|---|---|
| P1.1 | Dependency Graph builder (edges, blast radius, cycles, orphans) | Pending |
| P1.2 | API Surface analyzer (routes, methods, auth, external calls) | Pending |
| P1.3 | Data Model analyzer (ORM schemas, interfaces, validation) | Pending |
| P1.4 | LLM service integration (configurable provider, model, API key) | Pending |
| P1.5 | Selective file picker (category + blast radius criteria) | Pending |
| P1.6 | Per-file LLM analysis (purpose, business context, key behaviors) | Pending |
| P1.7 | Project-level LLM analysis (architecture summary, business flows) | Pending |

### P2: Quality & Security Metadata (enhances agent accuracy)

| # | Deliverable | Status |
|---|---|---|
| P2.1 | Patterns & Conventions detector | Pending |
| P2.2 | Security-Relevant Metadata scanner | Pending |
| P2.3 | Content & Structure mapper (page tree, middleware chain) | Pending |

### Future Enhancements (not in M3)

| # | Enhancement | Depends On |
|---|---|---|
| F1 | Comprehensive LLM analysis (all files, not just selective) | Cost/latency optimization |
| F2 | Incremental diff-based re-analysis (only changed files) | GitHub Compare API |
| F3 | Git history analysis (change frequency, churn detection) | `git clone --shallow` |
| F4 | User annotation/correction of analysis results | UI for editing metadata |
| F5 | Large codebase optimization (500k+ LOC streaming) | Performance profiling |
| F6 | LLM quality scoring and regeneration | Feedback loop from downstream agents |

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
| `llm_intelligence` | JSONB (nullable) | Architecture summary, business flows, tech stack narrative |
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
  "exports": [{ "name": "AuthGuard", "type": "named", "kind": "class" }],
  "llm": {
    "purpose": "NestJS guard that validates Firebase ID tokens on protected routes",
    "businessContext": "Core authentication gate — every protected API endpoint passes through this guard before reaching the handler",
    "keyBehaviors": [
      "Extracts Bearer token from Authorization header",
      "Verifies token via FirebaseAdminService.verifyIdToken()",
      "Upserts user record via UsersService on successful verification",
      "Attaches user object to request for downstream access via @CurrentUser()"
    ]
  }
}]
```
**Note:** The `llm` field is only populated for files selected by the LLM analysis criteria (category + blast radius). For non-selected files, `llm` is `null`.

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

**`llmIntelligence`**:
```json
{
  "architectureSummary": "Turborepo monorepo with a NestJS 10.x API backend (port 4000) and Next.js 15 frontend (port 3000). Authentication uses Firebase Auth with client SDK on the frontend and Admin SDK verification on the API via an AuthGuard pattern. Data is stored in PostgreSQL using Drizzle ORM with a Symbol-based injection token. GitHub integration uses a separate OAuth App for repository access, with tokens encrypted via AES-256-GCM.",
  "businessFlows": [
    {
      "name": "User Authentication",
      "description": "User signs up or logs in via Firebase Auth (email/password or GitHub OAuth). The frontend obtains a Firebase ID token and sends it as a Bearer token on API requests. The API AuthGuard verifies the token via Firebase Admin SDK and upserts the user record.",
      "files": [
        "apps/web/src/contexts/auth-context.tsx",
        "apps/api/src/auth/auth.guard.ts",
        "apps/api/src/auth/firebase-admin.service.ts",
        "apps/api/src/users/users.service.ts"
      ]
    },
    {
      "name": "GitHub Repository Connection",
      "description": "User initiates GitHub OAuth from the dashboard. The API generates an auth URL with encrypted state, GitHub redirects back with a code, the API exchanges it for a token and stores it encrypted. User then selects a repo, the API creates a project record and registers a webhook.",
      "files": [
        "apps/web/src/components/projects/connect-repo.tsx",
        "apps/api/src/github/github-oauth.service.ts",
        "apps/api/src/github/github.controller.ts",
        "apps/api/src/projects/projects.service.ts",
        "apps/api/src/github/github.service.ts"
      ]
    }
  ],
  "techStackNarrative": "TypeScript monorepo managed by Turborepo and pnpm. The API uses NestJS with feature-based module organization, Drizzle ORM for database access, and Firebase Admin SDK for authentication. The frontend uses Next.js 15 App Router with server component pages delegating to 'use client' interactive components. Styling uses inline React.CSSProperties. Sensitive data (GitHub tokens, webhook secrets) is encrypted at rest using AES-256-GCM via a shared EncryptionService."
}
```
