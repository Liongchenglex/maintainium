# Handover: Codebase Intelligence → Orchestrator, Monitor, BA Agents

## Purpose

This document provides the implementation context needed to build the **Orchestrator Agent**, **Monitor Agent**, and **Business Analyst (BA) Agents**. It describes what data is available from the Codebase Intelligence Agent (M3), how to access it, what's missing, and a key architectural refinement: **per-feature BA agents**.

---

## 1. What Exists Today (M3 Complete)

### Data Available

The Codebase Intelligence Agent produces a single `codebase_analyses` record per project. All data is stored as JSONB columns, accessed via `GET /projects/:id/analysis`.

| Column | What It Contains | Key Downstream Use |
|---|---|---|
| `project_metadata` | Frameworks, language, package manager, build tool, deployment targets, env vars, entry points | Monitor: tech stack scanning. Orchestrator: routing decisions. |
| `dependency_inventory` | Package name, version, direct/transitive, framework-critical flag | Monitor: CVE scanning, outdated package detection |
| `file_registry` | Per-file: path, language, size, category, imports, exports, **LLM analysis** (purpose, businessContext, **feature**, functions) | BA: feature mapping. Implementation: code understanding. |
| `dependency_graph` | Import edges, blast radius per file, circular deps, orphans | Implementation: change impact. BA: feature boundary analysis. |
| `api_surface` | Routes (path, method, handler, auth), external API calls | Monitor: API health. Security: auth coverage. BA: feature surface. |
| `data_model` | ORM schemas with columns and source (drizzle/prisma/typeorm/zod) | Implementation: data integrity. BA: data ownership per feature. |
| `patterns` | Auth, error handling, state management, styling, testing, naming conventions | Implementation: pattern compliance. BA: feature conventions. |
| `security_metadata` | Auth files, input handlers, DB interaction files, hardcoded secrets, CORS, security headers | Monitor: security scanning. |
| `content_structure` | Page tree, component hierarchy, middleware chain | BA: frontend feature mapping. |
| `llm_intelligence` | Architecture summary, business flows (name + description + files), tech stack narrative | Orchestrator: high-level routing. BA: feature context. |

### How Agents Read Codebase Context

**Agents do NOT have access to the raw GitHub repo.** The full repository is downloaded as a tarball during analysis, processed, and then deleted. Only the structured JSONB analysis results persist.

To get codebase context, agents must:

1. **Read from `codebase_analyses` table** — query by `project_id`, parse the JSONB columns
2. **Use the existing API endpoint** — `GET /projects/:id/analysis` returns the full record
3. **For raw file content** — use the GitHub proxy endpoints: `GET /projects/:id/tree?path=` and `GET /projects/:id/file?path=` (requires user's GitHub token)

### What Agents CAN Derive Without the Raw Repo

| Need | Source | Raw Repo Required? |
|---|---|---|
| "What does file X do?" | `file_registry[].llm.purpose` + `llm.businessContext` | No |
| "What feature does file X belong to?" | `file_registry[].llm.feature` | No |
| "What files are in feature Y?" | Filter `file_registry` by `llm.feature === 'Y'` | No |
| "What imports does file X have?" | `file_registry[].imports` | No |
| "What's the blast radius of changing file X?" | `dependency_graph.blastRadius[filePath]` | No |
| "What API routes exist?" | `api_surface.routes[]` | No |
| "What packages are outdated?" | `dependency_inventory[]` + external CVE/registry API | No |
| "What does the actual code look like?" | GitHub proxy: `GET /projects/:id/file?path=X` | **Yes** (needs GitHub token) |
| "What changed in the last push?" | Not currently stored | **Yes** (needs webhook payload or GitHub compare API) |

### Key Gap: No Stored File Content

The analysis stores metadata *about* files but not the file content itself. When an agent needs to read actual source code (e.g., Implementation Agent writing a fix, or BA Agent understanding complex logic), it must use the GitHub file proxy, which requires the user's GitHub token.

**Implication for agent design:** Agents that need raw code must either:
- (a) Have access to the user's GitHub token (via `UsersService.getGithubToken()`)
- (b) Request file content through the Orchestrator, which has token access

---

## 2. Feature Discovery: The `llm.feature` Field

This is the most important field for the per-feature BA model.

During LLM analysis, each file is tagged with a `feature` name:

```typescript
interface FileLlmResult {
  purpose: string;           // "Handles OAuth token encryption"
  businessContext: string;   // "Part of the GitHub integration for secure token storage"
  feature: string;           // "github-connection"  ← THIS IS THE KEY
  functions: { name: string; description: string }[];
}
```

The LLM assigns `feature` as a kebab-case name based on its understanding of what business capability the file belongs to. For example, an analysis of this project might produce:

```
authentication          → auth.guard.ts, auth.module.ts, firebase-admin.service.ts, ...
github-connection       → github.service.ts, github.controller.ts, github-tokens schema, ...
project-management      → projects.service.ts, projects.controller.ts, ...
codebase-intelligence   → analysis.service.ts, all analyzers, llm.service.ts, ...
webhook-processing      → webhooks.service.ts, webhooks.controller.ts, ...
```

### How to Extract Features

```typescript
// Given: fileRegistry from codebase_analyses.file_registry
const fileRegistry: FileRegistryEntry[] = analysis.fileRegistry;

// Group files by feature
const featureMap = new Map<string, FileRegistryEntry[]>();
for (const file of fileRegistry) {
  if (!file.llm?.feature) continue;
  const existing = featureMap.get(file.llm.feature) || [];
  existing.push(file);
  featureMap.set(file.llm.feature, existing);
}

// Result: Map { "authentication" => [12 files], "github-connection" => [8 files], ... }
```

### Current Limitations of Feature Tagging

1. **LLM-assigned, not deterministic** — Different analysis runs might produce slightly different feature names (e.g., `auth` vs `authentication`). Need normalization or a canonical feature registry.
2. **No feature hierarchy** — Features are flat strings. No concept of sub-features (e.g., `github-connection/oauth` vs `github-connection/webhooks`).
3. **Files without LLM analysis** — If the LLM is unavailable or a file wasn't selected for LLM analysis (~20-50 files are selected), `llm` is `null` and there's no feature tag. These files would be unassigned.
4. **Cross-cutting files** — Some files belong to multiple features (e.g., `database.module.ts` serves all features). The current model assigns exactly one feature per file.

---

## 3. Architecture Refinement: Per-Feature BA Agents

### Current Design (agent-architecture.md)

The architecture doc describes a **single Triage Agent** that classifies ALL incoming tickets. This is the entry point for the Detection Layer.

### Proposed Refinement: Two-Layer BA Model

```
Incoming Issue
      │
      ▼
┌─────────────┐
│ Triage Agent │  ← Classifies: bug/config/knowledge-gap/new-requirement/duplicate
│  (Global)    │  ← Routes to correct feature BA
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Feature BA Agent  │  ← SME for "authentication" (knows all 12 files, patterns, flows)
│ (per feature)     │  ← Deep analysis: root cause, affected components, risk
└──────────────────┘
       │
       ▼
  Orchestrator → Implementation Agent
```

**Triage Agent (global, one instance):**
- Receives all incoming issues (tickets, webhooks, annotations, monitor alerts)
- Classifies: bug / config issue / knowledge gap / new requirement / duplicate
- Identifies which feature is affected (using `file_registry[].llm.feature` + issue content matching)
- Routes to the correct Feature BA

**Feature BA Agent (per feature, N instances):**
- SME for a specific feature (e.g., "authentication")
- Knows: all files in the feature, their purposes, the dependency graph edges, API routes, data model tables, patterns used
- Performs deep analysis: root cause hypothesis, affected components within the feature, blast radius, risk assessment
- Produces an enriched context package for the Implementation Agent

### Feature BA Context Loading

Each Feature BA should be initialized with a context package derived from the analysis:

```typescript
interface FeatureBaContext {
  featureName: string;                              // "authentication"
  files: {
    path: string;
    purpose: string;                                // from llm.purpose
    businessContext: string;                         // from llm.businessContext
    category: FileCategory;
    functions: { name: string; description: string }[];
    imports: { internal: string[]; external: string[] };
    exports: ExportEntry[];
  }[];
  internalDependencies: DependencyEdge[];           // edges where both source & target are in this feature
  crossFeatureDependencies: DependencyEdge[];       // edges where one side is outside this feature
  apiRoutes: ApiRoute[];                            // routes handled by files in this feature
  dataModelTables: SchemaTable[];                   // schemas defined in files in this feature
  externalCalls: ExternalApiCall[];                 // external API calls from this feature
  blastRadius: Record<string, number>;              // blast radius for files in this feature
  businessFlows: BusinessFlow[];                    // flows involving files in this feature
}
```

### When Feature BAs Are Created / Updated

- **On analysis completion:** Extract unique features from `file_registry[].llm.feature`, create/update a Feature BA context for each
- **On re-analysis:** Rebuild all Feature BA contexts (features may have been added, removed, or renamed)
- **Storage:** Feature BA contexts can be derived on-the-fly from `codebase_analyses` or pre-computed and cached in a new table

### Open Design Decisions

| # | Decision | Options |
|---|---|---|
| 1 | Feature name normalization | (a) Accept LLM output as-is, (b) Normalize to canonical names via a second LLM pass, (c) Let users define/edit feature names |
| 2 | Untagged files | (a) Assign to "shared/infrastructure" pseudo-feature, (b) Run LLM on them to get tags, (c) Ignore |
| 3 | Cross-cutting files | (a) Assign to primary feature only, (b) Duplicate into multiple BA contexts, (c) Create a "shared" BA |
| 4 | BA agent persistence | (a) Ephemeral — rebuild context per issue, (b) Long-lived — maintain conversation memory across issues for learning |
| 5 | Feature count scaling | What if LLM identifies 50 features? Cap at N most important? Merge small features? |

---

## 4. Orchestrator Agent — Implementation Context

### What It Needs from Codebase Intelligence

| Need | Source |
|---|---|
| Feature list (for routing) | Unique values of `file_registry[].llm.feature` |
| Tech stack (for specialist selection) | `project_metadata.frameworks`, `project_metadata.language` |
| Business flows (for impact assessment) | `llm_intelligence.businessFlows` |
| Architecture summary (for high-level decisions) | `llm_intelligence.architectureSummary` |

### Workflow State Machine

The Orchestrator manages issue lifecycle. Suggested states:

```
detected → triaged → assigned_to_ba → analyzed → implementing → validating → previewing → deployed
                                                      ↑                          │
                                                      └── retry (validation fail)┘
```

Each transition is an event. The Orchestrator subscribes to all agent output events and decides the next step.

### Key Implementation Pattern

Follow the existing event-driven pattern from M3:

```typescript
// Existing pattern in the codebase:
@OnEvent(ANALYSIS_EVENTS.PROJECT_CREATED)
async handleProjectCreated(payload: ProjectCreatedPayload): Promise<void> { ... }

// Orchestrator would follow the same pattern:
@OnEvent(ORCHESTRATOR_EVENTS.ISSUE_DETECTED)
async handleIssueDetected(payload: IssueDetectedPayload): Promise<void> { ... }

@OnEvent(ORCHESTRATOR_EVENTS.TRIAGE_COMPLETED)
async handleTriageCompleted(payload: TriageResultPayload): Promise<void> { ... }
```

---

## 5. Monitor Agent — Implementation Context

### What It Reads from Codebase Intelligence

| Scan Type | Data Source | What to Check |
|---|---|---|
| CVE / Security | `dependency_inventory[]` | Cross-reference package names + versions against NVD / GitHub Advisory APIs |
| Outdated Packages | `dependency_inventory[]` | Compare `currentVersion` against npm/PyPI latest |
| Auth Coverage | `api_surface.routes[]` | Flag routes where `auth === false` or `auth === 'unknown'` |
| Hardcoded Secrets | `security_metadata.hardcodedSecrets[]` | Already detected by M3 — surface as alerts |
| Missing Security Headers | `security_metadata.securityHeaders[]` | Flag if empty or incomplete |
| Dead Code | `dependency_graph.orphans[]` | Already detected — surface as maintenance items |
| Circular Dependencies | `dependency_graph.circularDependencies[]` | Already detected — surface as code health items |
| Framework EOL | `project_metadata.frameworks[]` + `project_metadata.language` | Compare versions against known EOL dates |

### What It Does NOT Get from Codebase Intelligence

| Need | Why It's Missing | How to Get It |
|---|---|---|
| Live uptime / health checks | Analysis is static, not runtime | HTTP ping to project's deployed URL |
| SSL certificate status | Not in source code | TLS handshake to project's domain |
| Performance metrics (CWV) | Not in source code | Lighthouse / PageSpeed API |
| Runtime error rates | Not in source code | Integration with error tracking (Sentry, etc.) |

### Suggested Module Structure

```
apps/api/src/monitor/
├── monitor.module.ts
├── monitor.service.ts              ← Orchestrates scan runs
├── monitor.controller.ts           ← Manual scan trigger, scan results API
├── monitor.constants.ts            ← Event names, scan types
├── scanners/
│   ├── dependency-cve.scanner.ts   ← NVD / GitHub Advisory lookup
│   ├── dependency-outdated.scanner.ts
│   ├── auth-coverage.scanner.ts    ← Reads api_surface from analysis
│   ├── security-posture.scanner.ts ← Reads security_metadata from analysis
│   └── code-health.scanner.ts      ← Reads dependency_graph (orphans, cycles)
└── interfaces/
    └── monitor.interfaces.ts
```

---

## 6. Existing Patterns to Follow

All agents should follow the established codebase patterns:

| Pattern | Reference |
|---|---|
| NestJS feature module (Module/Controller/Service) | `apps/api/src/analysis/analysis.module.ts` |
| Event-driven async processing (`@OnEvent`) | `apps/api/src/analysis/analysis.service.ts` |
| Database access via `@Inject(DRIZZLE)` | All services |
| Auth guard on endpoints | `@UseGuards(AuthGuard)` on all controllers |
| Project ownership check | `projectsService.findByIdWithAuth(id, userId)` |
| Config via `@nestjs/config` | `configService.get<string>('KEY')` |
| Circular module resolution | `forwardRef(() => ModuleName)` where needed |

---

## 7. Data Flow Summary

```
                    ┌──────────────────────────────────────────────────┐
                    │              codebase_analyses                    │
                    │  (JSONB: metadata, files, graph, api, llm, ...)  │
                    └─────────────────────┬────────────────────────────┘
                                          │
                              Agents READ from here
                                          │
              ┌───────────────┬───────────┼───────────┬────────────────┐
              ▼               ▼           ▼           ▼                ▼
        ┌───────────┐  ┌──────────┐  ┌────────┐  ┌────────┐  ┌──────────────┐
        │ Monitor   │  │ Triage   │  │Feature │  │Orchestr│  │Implementation│
        │ Agent     │  │ Agent    │  │BA (×N) │  │ator    │  │Agent         │
        └───────────┘  └──────────┘  └────────┘  └────────┘  └──────────────┘
              │               │           │           │                │
              │          classifies   deep domain  routes &        reads code
              │          & routes     analysis    coordinates    via GitHub proxy
              │               │           │           │                │
        detects issues   ─────┴───────────┘           │         GET /projects/:id/file
        (CVE, health)         │                       │                │
              │          enriched context              │                │
              └───────────────┴───────────────────────►│                │
                                                       │                │
                                              assigns task ────────────►│
```

### Raw Code Access Path

When an agent needs actual source code (not just metadata):

```
Agent → needs file content
     → calls GitHubService.getFileContent(token, owner, repo, path, ref)
     → requires: user's decrypted GitHub token (via UsersService.getGithubToken)
     → returns: file content as string
```

**Existing endpoints:**
- `GET /projects/:id/tree?path=` — directory listing
- `GET /projects/:id/file?path=` — file content (up to 1MB, base64-decoded)

---

## 8. What Needs to Be Built Before Agents Can Work

| Prerequisite | Why | Effort |
|---|---|---|
| Feature extraction utility | Derive unique features from `file_registry[].llm.feature`, group files by feature | Small — utility function |
| Feature BA context builder | Build `FeatureBaContext` struct from analysis data for a given feature name | Medium — query + assembly |
| Issue/ticket data model | Table to track issues through their lifecycle (detected → deployed) | Medium — schema + CRUD |
| Orchestrator event bus | Define event names and payload interfaces for all agent-to-agent communication | Medium — constants + interfaces |
| Monitor scan results table | Store scan results with severity, category, affected packages/files | Medium — schema + CRUD |

---

## 9. Files to Read for Full Context

| File | What You'll Learn |
|---|---|
| `docs/agent-architecture.md` | Full agent design with roles, triggers, interactions, open questions |
| `docs/features/codebase_agent/feature.md` | M3 implementation: files, data model, API contracts, sequence diagrams |
| `docs/features/codebase_agent/backlog.md` | Known gaps: LLM cost tracking, incremental analysis |
| `apps/api/src/analysis/analysis.interfaces.ts` | All TypeScript interfaces for analysis data shapes |
| `apps/api/src/analysis/analysis.service.ts` | Analysis pipeline orchestration (event handlers, pipeline phases) |
| `apps/api/src/analysis/services/llm.service.ts` | LLM integration pattern (Anthropic SDK, prompt caching, retry) |
| `apps/api/src/database/schema/codebase-analyses.ts` | Database schema for analysis storage |
| `apps/api/src/webhooks/webhooks.service.ts` | Webhook processing (push events, HMAC verification) |
| `docs/playbook/coding-pattern.md` | Codebase conventions that all new code must follow |
