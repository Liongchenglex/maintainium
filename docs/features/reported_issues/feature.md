# Reported Issues — Issue Triage & Diagnosis Pipeline (M5b) — Feature Doc

## Feature

**Name:** Reported Issues — Issue Triage & Diagnosis Pipeline
**Purpose:** Automated triage and diagnosis of customer-reported issues using two fixed LLM agents (Triage Agent, Diagnosis Agent) that leverage M3 codebase intelligence and pgvector memory to classify, root-cause, and propose fixes — all without human intervention.

---

## Agent Architecture

This feature introduces the project's **two fixed AI agents**. These are not dynamic or user-configurable — they are permanent pipeline stages that every reported issue flows through. They exist because the project has exactly two capabilities it automates: classification (triage) and root-cause analysis (diagnosis).

### Agent 1: Triage Agent (`TriageAgentService`)

| Property | Value |
|---|---|
| **Role** | Classify incoming issues into M3-discovered feature areas and assign priority |
| **Trigger** | `@OnEvent('issue.received')` — fires on every new issue submission |
| **LLM Client** | Own Anthropic client (not shared with M3's `LlmService`) |
| **Input** | Reporter email, subject, description, M3 feature areas list, architecture summary |
| **Output** | `assignedArea`, `priority`, `triageNotes`, `confidence` (0.0–1.0), `isTriageable` |
| **System prompt context** | Feature areas (from `llmIntelligence.businessFlows[].name` + `fileRegistry[].llm.feature`), architecture summary (from `llmIntelligence.architectureSummary` + `techStackNarrative`) |
| **Decision logic** | confidence > 0.7 → `triaged`; 0.4–0.7 → `triaged` + low-confidence flag; < 0.4 → `needs-review`; `isTriageable === false` → `needs-review` |
| **Failure mode** | LLM unavailable or error → `needs-review` with explanation note |
| **Retry** | 2x on 429/rate-limit, exponential backoff |

**Why own Anthropic client?** `LlmService` in AnalysisModule is not exported and is purpose-built for file/project analysis with prompt caching. The triage agent uses a completely different system prompt (feature area classification) and has no need for cache blocks. Each agent creating its own client follows the B12 pattern (ConfigService → LLM_API_KEY).

### Agent 2: Diagnosis Agent (`DiagnosisAgentService`)

| Property | Value |
|---|---|
| **Role** | Root-cause analysis, proposed fix generation, complication scoring |
| **Trigger** | Manual via `POST /projects/:id/issues/:issueId/diagnose` (fire-and-forget) |
| **LLM Client** | Own Anthropic client (separate from triage agent and M3) |
| **Input** | Issue details, triage notes, M3 structured context (architecture, API routes, data model, file analysis), actual source code (top 5 files from GitHub), top 3 similar past issues (from vector memory) |
| **Output** | `recommendationType`, `summary`, `rootCause`, `complicationScore` (1–10), `proposedChanges` (InvestigationData format), `educationContent`, `clarificationQuestions` |
| **System prompt context** | M3 codebase intelligence (architecture summary, tech stack, business flow, API routes, data model, codebase patterns, detailed file analysis with purpose/functions/blast radius), actual source code for top 5 key files (fetched from GitHub, max 200 lines each), area file paths, similar past issues from pgvector |
| **Decision matrix** | `code-fix` (bug with code solution) / `user-education` (misunderstanding) / `needs-clarification` (insufficient detail) / `escalation` (too complex or cross-cutting) |
| **Complication scoring** | 1–3: single-file fix; 4–6: multi-file refactor; 7–10: architectural change |
| **Failure mode** | LLM unavailable or error → `diagnosis-failed` status |
| **Retry** | 2x on 429/rate-limit, exponential backoff |
| **max_tokens** | 8192 (increased from 4096 to support richer context-informed responses) |

#### M3 Context Enrichment (`buildM3Context`)

The diagnosis agent extracts rich structured context from M3 analysis data to give the LLM deep understanding of the feature area:

| M3 Source | Data Extracted | Limit |
|---|---|---|
| `llmIntelligence.architectureSummary` | Project architecture overview | Full text |
| `llmIntelligence.techStackNarrative` | Technology stack description | Full text |
| `llmIntelligence.businessFlows[]` | Business flow description + file list for the assigned area | 15 files max |
| `apiSurface.routes[]` | API routes handled by area files | 15 routes max |
| `apiSurface.externalCalls[]` | External API calls from area files | 10 calls max |
| `dataModel.schemas[]` | Database schema definitions with columns | 10 schemas, 10 cols each |
| `patterns` | Auth, error handling, naming conventions | All available |
| `fileRegistry[]` filtered by `llm.feature` | File path, category, language, purpose, business context, functions, blast radius | 20 files, 5 functions each |

Returns `''` if analysis is null (graceful degradation — diagnosis continues with issue text + vector memory only).

#### GitHub File Content Fetching (`fetchAreaFileContents`)

Fetches actual source code from GitHub for the top 5 most important area files, enabling the LLM to reference real code in its diagnosis and proposed diffs.

**File selection scoring:**
- Base score = blast radius from `dependencyGraph.blastRadius`
- +10 bonus for `service`, `api-route`, `middleware`, `schema` categories
- -5 penalty for files > 15KB (deprioritize large files)
- Sort by score descending, take top 5

**Fetch process:**
1. `UsersService.getGithubToken(userId)` → decrypt token
2. `ProjectsService.findById(projectId)` → get `githubOwner`, `githubRepoName`, `githubDefaultBranch`
3. `Promise.allSettled()` — fetch each file independently (one failure doesn't block others)
4. `GitHubService.getFileContent()` → base64 decode → truncate to 200 lines

**Graceful degradation:** Token unavailable, GitHub error, rate limit → returns `[]`, logged as warning. Diagnosis continues with M3 structured data only.

**Why a separate agent (not merged with triage)?** Triage and diagnosis are fundamentally different tasks with different contexts. Triage needs the full project feature map (broad, shallow). Diagnosis needs area-specific file lists, M3 structured data, actual source code, and vector memory (narrow, deep). Merging them would bloat the prompt and degrade quality. The event-driven separation also means triage failures don't block diagnosis retries, and reassignment cleanly re-triggers only diagnosis.

### Vector Memory (`EmbeddingService`)

| Property | Value |
|---|---|
| **Role** | Long-term memory for diagnosis — stores past issues and resolutions per feature area |
| **Embedding model** | OpenAI `text-embedding-3-small` (1536 dimensions) |
| **Storage** | `agent_memory_embeddings` table with pgvector `vector(1536)` column |
| **Scoping** | `WHERE project_id = ? AND feature_area = ?` — no cross-project or cross-area leakage |
| **Write trigger** | After successful diagnosis: stores issue text + diagnosis text as two separate embeddings |
| **Read trigger** | Before diagnosis: queries top 3 similar past issues by cosine similarity |
| **Graceful degradation** | `OPENAI_API_KEY` not set → diagnosis works without memory context (cold start always) |
| **Content types** | `issue` (reporter's description), `diagnosis` (agent's root cause + solution) |

**Why OpenAI for embeddings, not Anthropic?** Anthropic does not offer an embeddings API. OpenAI `text-embedding-3-small` is the industry-standard choice: 1536 dimensions, cheap ($0.02/1M tokens), fast, and well-supported by pgvector.

---

## Key Files

### Backend

| File | Purpose |
|---|---|
| `apps/api/src/issues/issues.module.ts` | NestJS module: imports Users, Auth, Projects, Analysis, GitHub via forwardRef |
| `apps/api/src/issues/issues.controller.ts` | REST endpoints: CRUD, feature-areas, reassign, resolve |
| `apps/api/src/issues/issues.service.ts` | CRUD operations, event emission, reassign/resolve orchestration |
| `apps/api/src/issues/issues.constants.ts` | Event name constants (`issue.received`, `issue.triaged`) |
| `apps/api/src/issues/issues.interfaces.ts` | Payload types (IssueTriagedPayload includes userId), LLM response shapes, ProposedChanges (matches InvestigationData) |
| `apps/api/src/issues/dto/create-issue.dto.ts` | class-validator: reporterEmail, subject, description |
| `apps/api/src/issues/dto/reassign-issue.dto.ts` | class-validator: assignedArea |
| `apps/api/src/issues/services/triage-agent.service.ts` | Triage Agent: own Anthropic client, M3 feature area extraction, LLM classification |
| `apps/api/src/issues/services/diagnosis-agent.service.ts` | Diagnosis Agent: own Anthropic client, M3 context builder, GitHub file fetcher, area file lookup, vector memory query, enriched LLM diagnosis |
| `apps/api/src/issues/services/embedding.service.ts` | OpenAI embeddings: embed(), storeEmbedding(), findSimilar() via raw SQL |

### Schema

| File | Purpose |
|---|---|
| `apps/api/src/database/schema/reported-issues.ts` | `reported_issues` table + status/priority enums |
| `apps/api/src/database/schema/issue-diagnoses.ts` | `issue_diagnoses` table + recommendation_type enum |
| `apps/api/src/database/schema/agent-memory.ts` | `agent_memory_embeddings` table with custom pgvector type |

### Frontend

| File | Purpose |
|---|---|
| `apps/web/src/components/issues/reported-issues-overview.tsx` | Issue list: real API, submit button, filters, clickable cards |
| `apps/web/src/components/issues/reported-issues-mock.ts` | Shared TypeScript types (ReportedIssue, IssueDiagnosis, enums) |
| `apps/web/src/components/issues/submit-issue-form.tsx` | Modal form: reporterEmail, subject, description |
| `apps/web/src/components/issues/issue-detail-card.tsx` | Two-column detail: diagnosis, DiffView, reassign, resolve, implement button |
| `apps/web/src/app/dashboard/projects/[id]/issues/[issueId]/page.tsx` | Next.js dynamic route |

### Modified Existing Files

| File | Change |
|---|---|
| `apps/api/src/database/schema/index.ts` | Added 3 new table exports |
| `apps/api/src/app.module.ts` | Added IssuesModule |

---

## Data Models

### `reported_issues` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | defaultRandom() |
| `project_id` | UUID FK → projects | notNull |
| `reporter_email` | varchar(255) | notNull |
| `subject` | varchar(500) | notNull |
| `description` | text | notNull |
| `status` | enum: new/triaged/needs-review/diagnosed/diagnosis-failed/resolved | default 'new' |
| `priority` | enum: critical/high/medium/low | nullable (set by triage agent) |
| `assigned_area` | varchar(255) | nullable (set by triage agent) |
| `triage_notes` | text | nullable (triage agent explanation) |
| `triage_confidence` | real | nullable, 0.0–1.0 |
| `created_at` | timestamp tz | defaultNow() |
| `updated_at` | timestamp tz | defaultNow() |

**Ownership:** One issue per submission. Source of truth for triage state. Written by IssuesService (create), TriageAgentService (triage), DiagnosisAgentService (status update).

### `issue_diagnoses` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | defaultRandom() |
| `issue_id` | UUID FK → reported_issues | notNull |
| `project_id` | UUID FK → projects | notNull |
| `recommendation_type` | enum: code-fix/user-education/needs-clarification/escalation | notNull |
| `summary` | text | notNull |
| `root_cause` | text | notNull |
| `complication_score` | integer | notNull, 1–10 |
| `proposed_changes` | JSONB | nullable, InvestigationData format (code-fix only) |
| `education_content` | text | nullable (user-education only) |
| `clarification_questions` | JSONB | nullable, string[] (needs-clarification only) |
| `is_archived` | boolean | default false — set true on reassign |
| `created_at` | timestamp tz | defaultNow() |
| `updated_at` | timestamp tz | defaultNow() |

**Ownership:** Written exclusively by DiagnosisAgentService. Archived (not deleted) on reassign. Active diagnosis = `is_archived = false` + latest `created_at`.

### `agent_memory_embeddings` table (pgvector)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | defaultRandom() |
| `project_id` | UUID FK → projects | notNull — scoping boundary |
| `feature_area` | varchar(255) | notNull — scoping boundary |
| `content_type` | varchar(50) | 'issue' or 'diagnosis' |
| `content` | text | notNull — the text that was embedded |
| `embedding` | vector(1536) | notNull — OpenAI text-embedding-3-small output |
| `metadata` | JSONB | { issueId, diagnosisId } for traceability |
| `created_at` | timestamp tz | defaultNow() |

**Ownership:** Written by EmbeddingService after successful diagnosis. Read by EmbeddingService before diagnosis (cosine similarity lookup). Scoped by `(project_id, feature_area)` — no cross-project or cross-area reads.

**Requires:** `CREATE EXTENSION IF NOT EXISTS vector;` and `pgvector/pgvector:pg15` Docker image.

---

## API Contracts & Payloads

### POST /projects/:id/issues

**Auth:** AuthGuard + `findByIdWithAuth`

**Request:**
```json
{
  "reporterEmail": "user@example.com",
  "subject": "Cannot log in after password reset",
  "description": "Full description of the issue..."
}
```

**Response (201):** Full `reported_issues` row (status: `new`)

**Side effect:** Emits `issue.received` → triggers triage agent asynchronously

### GET /projects/:id/issues

**Auth:** AuthGuard + `findByIdWithAuth`

**Query params:** `?status=triaged&priority=high&area=authentication` (all optional)

**Response (200):** `ReportedIssue[]` ordered by `created_at DESC`

### GET /projects/:id/issues/:issueId

**Auth:** AuthGuard + `findByIdWithAuth`

**Response (200):** `ReportedIssue` with nested `diagnosis: IssueDiagnosis | null`

### GET /projects/:id/feature-areas

**Auth:** AuthGuard + `findByIdWithAuth`

**Response (200):** `string[]` — sorted feature area names from M3 analysis

### PATCH /projects/:id/issues/:issueId/reassign

**Auth:** AuthGuard + `findByIdWithAuth`

**Request:**
```json
{ "assignedArea": "authentication" }
```

**Response (200):** Updated `ReportedIssue` (status reset to `triaged`)

**Side effect:** Archives existing diagnosis, emits `issue.triaged` → triggers new diagnosis

### PATCH /projects/:id/issues/:issueId/resolve

**Auth:** AuthGuard + `findByIdWithAuth`

**Response (200):** Updated `ReportedIssue` (status: `resolved`)

---

## Sequence Diagram

### Flow A: Submit → Triage → Diagnose (happy path)

```
User → UI: Fill submit form, click "Submit Issue"
UI → API: POST /projects/:id/issues { reporterEmail, subject, description }
API → DB: INSERT reported_issues (status: 'new')
API → EventEmitter: emit('issue.received', { issueId, projectId })
API → UI: 201 Created (issue record)

EventEmitter → TriageAgentService: handleIssueReceived()
TriageAgent → AnalysisService: findByProjectId() → M3 data
TriageAgent → TriageAgent: extractFeatureAreas() from llmIntelligence + fileRegistry
TriageAgent → Anthropic LLM: classify issue against feature areas
Anthropic LLM → TriageAgent: { assignedArea, priority, confidence, triageNotes }
TriageAgent → DB: UPDATE reported_issues (status: 'triaged', priority, assignedArea)
TriageAgent → EventEmitter: emit('issue.triaged', { issueId, projectId, assignedArea })

EventEmitter → DiagnosisAgentService: handleIssueTriaged()
DiagnosisAgent → AnalysisService: findByProjectId() → M3 data
DiagnosisAgent → DiagnosisAgent: extractAreaFiles() → file paths for assigned area
DiagnosisAgent → DiagnosisAgent: buildM3Context() → architecture, API routes, data model, patterns, file analysis
DiagnosisAgent → UsersService + ProjectsService + GitHubService: fetchAreaFileContents() → top 5 source files (base64 decode, 200-line truncation)
DiagnosisAgent → EmbeddingService: embed(issueText) → query findSimilar() → top 3 past issues
DiagnosisAgent → Anthropic LLM: diagnose with M3 context + source code + area files + vector memory
Anthropic LLM → DiagnosisAgent: { recommendationType, rootCause, complicationScore, proposedChanges }
DiagnosisAgent → DB: INSERT issue_diagnoses
DiagnosisAgent → DB: UPDATE reported_issues (status: 'diagnosed')
DiagnosisAgent → EmbeddingService: store issue + diagnosis embeddings in vector memory
```

### Flow B: Reassign

```
User → UI: Select new area from dropdown, click "Reassign"
UI → API: PATCH /projects/:id/issues/:issueId/reassign { assignedArea }
API → DB: UPDATE issue_diagnoses SET is_archived = true (old diagnosis)
API → DB: UPDATE reported_issues (assignedArea, status: 'triaged')
API → EventEmitter: emit('issue.triaged', { issueId, projectId, assignedArea })
EventEmitter → DiagnosisAgentService: (same Flow A diagnosis path with new area)
```

### Flow C: Resolve

```
User → UI: Click "Mark as Resolved"
UI → API: PATCH /projects/:id/issues/:issueId/resolve
API → DB: UPDATE reported_issues (status: 'resolved')
API → UI: Updated issue
```

---

## Visual Flow

```
[Project Detail Page] → [Reported Issues Tab]
                              ↓
                    [Issue List Overview]
                    ├── "+ Submit Issue" button → [Submit Modal]
                    ├── Priority summary chips
                    ├── Filters: Status / Priority / Area
                    └── Clickable issue cards (subject, description, badges)
                              ↓ click card
                    [Issue Detail Page — /projects/:id/issues/:issueId]
                    ├── Left Column
                    │   ├── Issue Description panel
                    │   ├── Diagnosis panel (summary, root cause, type + score chips)
                    │   ├── Proposed Implementation panel (strategy, files)
                    │   ├── Changes panel (DiffView — code-fix only)
                    │   ├── Test Scope panel (code-fix only)
                    │   ├── User Education panel (user-education only)
                    │   └── Clarification Questions panel (needs-clarification only)
                    └── Right Column
                        ├── Details sidebar (status, priority, area, reporter, dates)
                        └── Actions sidebar
                            ├── "Implement Changes" button (code-fix, score ≤ 6 — coming soon)
                            ├── "Mark as Resolved" button
                            └── Reassign dropdown + button
```

---

## Inputs & Outputs

### Inputs

- `reporterEmail` (required) — email address of the issue reporter
- `subject` (required) — brief summary, max 500 chars
- `description` (required) — full issue body
- `assignedArea` (required for reassign) — target feature area

### Outputs (success)

- Issue created with status `new` → auto-progresses to `triaged` → `diagnosed`
- Diagnosis includes: recommendation type, root cause, complication score
- For `code-fix`: InvestigationData with file diffs (same format as M4 monitor investigation)
- For `user-education`: suggested documentation/FAQ response
- For `needs-clarification`: list of questions to ask reporter

### Outputs (failure)

- LLM unavailable at triage → issue stays `needs-review`, manual triage required
- LLM unavailable at diagnosis → issue stays `diagnosis-failed`, can retry via reassign
- Malformed LLM response → defensive parsing with safe defaults (escalation, score 8)

---

## State & Ownership

**Source of truth:** `reported_issues` + `issue_diagnoses` tables (PostgreSQL)
**Vector memory:** `agent_memory_embeddings` table (PostgreSQL + pgvector)
**Cached on client:** No persistent cache; fetched on demand. User refreshes list page to see async status updates.

**Write ownership:**
- `reported_issues`: IssuesService (create, resolve, reassign), TriageAgentService (triage fields), DiagnosisAgentService (status only)
- `issue_diagnoses`: DiagnosisAgentService exclusively
- `agent_memory_embeddings`: EmbeddingService exclusively

---

## Security

**Auth required:** Yes — AuthGuard on every endpoint
**Ownership enforced on:** `findByIdWithAuth(projectId, userId)` on every request
**LLM prompt safety:** User-supplied text (subject, description) is always in the `user` message role, never injected into system prompts
**LLM output safety:** All LLM responses parsed defensively with try/catch and safe defaults — no LLM output executed as code
**Vector isolation:** Embeddings scoped by `(project_id, feature_area)` — no cross-project or cross-area leakage
**Auto-implement gating:** complicationScore 7–10 blocks the "Implement Changes" button (disabled with explanation)
**No secrets in errors:** Error messages from LLM failures are logged server-side, not exposed to frontend

---

## Dependencies

### External Services

- **Anthropic API** (`@anthropic-ai/sdk`) — LLM for triage classification and diagnosis generation
- **OpenAI API** (raw fetch) — `text-embedding-3-small` for vector embeddings (optional)
- **PostgreSQL + pgvector** — vector similarity search (`<=>` cosine distance operator)

### Internal Modules

- **AnalysisModule** (M3) — `AnalysisService.findByProjectId()` for M3 codebase data (feature areas, file registry, architecture summary, API surface, data model, patterns)
- **GitHubModule** (M2) — `GitHubService.getFileContent()` for fetching actual source code during diagnosis
- **ProjectsModule** (M2) — `ProjectsService.findByIdWithAuth()` for ownership checks, `ProjectsService.findById()` for GitHub repo info during file fetch
- **UsersModule** (M1) — Auth guard dependency, `UsersService.getGithubToken()` for GitHub API access during diagnosis
- **AuthModule** (M1) — AuthGuard, CurrentUser decorator

### Patterns Used

- **B3:** Symbol Injection Token (DRIZZLE)
- **B4:** Guard-Based Auth (`findByIdWithAuth` on every endpoint)
- **B7:** Circular Module Resolution (`forwardRef` for Users, Auth, Projects, Analysis)
- **B11:** Event-Driven Background Jobs (`@OnEvent` for async agent pipeline)
- **B12:** LLM Service Integration (ConfigService → LLM_API_KEY, `isAvailable()` check, `callWithRetry`)
- **F2:** Inline `React.CSSProperties` styling
- **F5:** API Client with Auth Headers (`get`, `post`, `patch` from `@/lib/api`)

### Env Variables

| Variable | Required | Purpose |
|---|---|---|
| `LLM_API_KEY` | For auto-triage/diagnosis | Anthropic API key (shared with M3) |
| `LLM_MODEL` | No (default: `claude-sonnet-4-5-20250929`) | LLM model for both agents |
| `OPENAI_API_KEY` | No (vector memory optional) | OpenAI API key for embeddings |

### Database Prerequisites

- Docker image: `pgvector/pgvector:pg15` (not plain `postgres:15`)
- Extension: `CREATE EXTENSION IF NOT EXISTS vector;`
- Schema push: `pnpm drizzle-kit push` from `apps/api/`
