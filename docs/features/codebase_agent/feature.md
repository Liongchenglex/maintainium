# Codebase Intelligence Agent — Feature Documentation

## Feature

**Name:** Codebase Intelligence Agent
**Purpose:** Automated static analysis + selective LLM analysis of connected GitHub repositories, producing structured JSONB metadata for downstream agents (M4 Scanner, M6 Implementation Agent).

---

## Key Files

### Backend

- `apps/api/src/analysis/analysis.module.ts` — NestJS module declaration
- `apps/api/src/analysis/analysis.controller.ts` — POST /projects/:id/analyze, GET /projects/:id/analysis
- `apps/api/src/analysis/analysis.service.ts` — Orchestrator: listens to events, runs pipeline
- `apps/api/src/analysis/analysis.interfaces.ts` — TypeScript interfaces for all JSONB structures
- `apps/api/src/analysis/analysis.constants.ts` — Event name constants
- `apps/api/src/analysis/services/repo-downloader.service.ts` — Tarball download + extraction + cleanup
- `apps/api/src/analysis/services/llm.service.ts` — Configurable LLM client (Anthropic SDK)
- `apps/api/src/analysis/analyzers/project-metadata.analyzer.ts` — Framework, language, package manager detection
- `apps/api/src/analysis/analyzers/dependency-inventory.analyzer.ts` — Package scanning from manifests
- `apps/api/src/analysis/analyzers/file-registry.analyzer.ts` — File tree walk, import/export parsing
- `apps/api/src/analysis/analyzers/dependency-graph.analyzer.ts` — Edges, blast radius, cycles, orphans
- `apps/api/src/analysis/analyzers/api-surface.analyzer.ts` — Route detection (NestJS, Express, Next.js)
- `apps/api/src/analysis/analyzers/data-model.analyzer.ts` — Schema detection (Drizzle, Prisma, TypeORM, Zod)
- `apps/api/src/analysis/analyzers/patterns.analyzer.ts` — Auth, styling, testing, naming conventions
- `apps/api/src/analysis/analyzers/security.analyzer.ts` — Auth files, input handlers, hardcoded secrets
- `apps/api/src/analysis/analyzers/content-structure.analyzer.ts` — Page tree, component hierarchy, middleware
- `apps/api/src/analysis/analyzers/llm-intelligence.analyzer.ts` — Selective LLM file analysis + project summary

### Schema

- `apps/api/src/database/schema/codebase-analyses.ts` — codebase_analyses table definition

### Frontend

- `apps/web/src/components/analysis/analysis-overview.tsx` — Analysis results display
- `apps/web/src/components/projects/project-detail.tsx` — Updated with Files/Analysis tabs
- `apps/web/src/components/ui/spinner.tsx` — Shared animated spinner component
- `apps/web/src/components/dashboard/project-card.tsx` — Analysis status indicator on project cards
- `apps/web/src/components/dashboard/dashboard-content.tsx` — Dashboard polling during active analysis

### Modified Existing Files

- `apps/api/src/app.module.ts` — Added EventEmitterModule, AnalysisModule
- `apps/api/src/database/schema/index.ts` — Added codebase-analyses export
- `apps/api/src/config/env.validation.ts` — Added optional LLM env var comments
- `apps/api/src/projects/projects.service.ts` — Emits project.created event
- `apps/api/src/webhooks/webhooks.service.ts` — Emits project.pushed event on default branch push
- `apps/api/.env.example` — Added LLM env vars

---

## Data Models

### `codebase_analyses` table

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Analysis record ID |
| `project_id` | UUID FK → projects (unique) | One analysis per project |
| `status` | enum: pending/analyzing/completed/failed | Current state |
| `error_message` | text nullable | Error details on failure |
| `project_metadata` | JSONB | Tech stack, frameworks, package manager |
| `file_registry` | JSONB | Array of file entries with imports/exports/LLM |
| `dependency_graph` | JSONB | Edges, blast radius, cycles, orphans |
| `dependency_inventory` | JSONB | Array of packages with versions |
| `api_surface` | JSONB | Routes and external API calls |
| `data_model` | JSONB | ORM schemas, interfaces, validation schemas |
| `patterns` | JSONB | Auth, styling, testing, naming patterns |
| `security_metadata` | JSONB | Auth files, input handlers, secrets |
| `content_structure` | JSONB | Page tree, component hierarchy, middleware |
| `llm_intelligence` | JSONB | Architecture summary, business flows |
| `analyzed_at` | timestamp | When analysis last completed |
| `analysis_duration_ms` | integer | How long analysis took |
| `version` | integer default 1 | Schema version |

---

## API Contracts & Payloads

### POST /projects/:id/analyze

**Auth:** Required (AuthGuard)

**Request:** Empty body

**Response (200):**
```json
{ "message": "Analysis started", "status": "pending" }
```

**Response (409):**
```json
{ "message": "Analysis already in progress" }
```

### GET /projects/:id/analysis

**Auth:** Required (AuthGuard)

**Response (200):** Full `codebase_analyses` record as JSON

**Response (404):**
```json
{ "message": "No analysis found for this project" }
```

---

## Sequence Diagram

### Flow A: Auto-trigger on project creation
```
User → UI: Create project (POST /projects)
UI → API: ProjectsService.createFromGitHub()
API → DB: Insert project record
API → EventEmitter: emit('project.created', { projectId, userId })
EventEmitter → AnalysisService: handleProjectCreated()
AnalysisService → GitHub: Download tarball
AnalysisService → Filesystem: Extract + analyze
AnalysisService → LLM: Selective file analysis (if API key set)
AnalysisService → DB: Store JSONB results in codebase_analyses
```

### Flow B: Webhook re-analysis
```
Developer → GitHub: git push origin main
GitHub → API: POST /webhooks/github (push event)
API → WebhooksService: Verify HMAC, check ref matches default branch
WebhooksService → EventEmitter: emit('project.pushed', { projectId })
EventEmitter → AnalysisService: handleProjectPushed()
AnalysisService → DB: Re-run full analysis pipeline
```

### Flow C: Manual re-scan
```
User → UI: Click "Re-scan" button
UI → API: POST /projects/:id/analyze
API → EventEmitter: emit('project.rescan', { projectId, userId })
EventEmitter → AnalysisService: handleRescan()
```

---

## Visual Flow

```
[Project Detail Page] → [Files Tab | Analysis Tab]
                              ↓
                    [Analysis Overview]
                    ├── Status Badge (pending/analyzing/completed/failed)
                    ├── Re-scan Button
                    ├── Architecture Overview (LLM)
                    ├── Business Flows (LLM)
                    ├── Tech Stack chips
                    ├── File Summary by category
                    ├── Dependencies (framework-critical highlighted)
                    └── API Routes table
```

---

## Inputs & Outputs

### Inputs
- GitHub OAuth token (from user's stored token via EncryptionService)
- Repository owner, name, default branch (from project record)

### Outputs (success)
- `codebase_analyses` record with status `completed` and populated JSONB columns
- Frontend displays analysis results on the Analysis tab

### Outputs (failure)
- `codebase_analyses` record with status `failed` and error message
- Frontend shows error with appropriate action prompt

---

## State & Ownership

**Source of truth:** `codebase_analyses` table (PostgreSQL)
**Cached on client:** No persistent cache; fetched on demand with 5-second polling during analysis

---

## Security

**Auth required:** Yes (AuthGuard on both endpoints)
**Ownership enforced on:** Project membership check via `findByIdWithAuth`
**Webhook auth:** HMAC-SHA256 verification (no user auth needed)

---

## Dependencies

- `@nestjs/event-emitter` — Async event bus for background analysis triggers
- `@anthropic-ai/sdk` — LLM API client (optional, graceful degradation)
- `tar` — Tarball extraction
- GitHub Archive API — Repository download
- EncryptionService (CommonModule) — GitHub token decryption
- ProjectsService — Project details and auth checks
- UsersService — GitHub token retrieval

### Patterns Used

- **B1:** Feature Module Structure
- **B3:** Symbol Injection Token (DRIZZLE)
- **B4:** Guard-Based Auth
- **B7:** Circular Module Resolution (forwardRef)
- **B11:** Event-Driven Background Jobs
- **B12:** LLM Service Integration
- **B13:** Anthropic Prompt Caching
- **F2:** Inline Styles
- **F5:** API Client with Auth Headers
