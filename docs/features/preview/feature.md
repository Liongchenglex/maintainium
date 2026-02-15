# Visual Preview & Apply (M7)

## 1. Feature Overview

Visual Preview allows users to inject an overlay script on their deployed site — either via a **bookmarklet** (drag-to-bookmarks-bar, zero-code) or a manual `<script>` tag. The script renders a floating toolbar that enables annotate mode — hover to highlight elements, click to capture, describe the change. The request hits the Maintanium API which uses M3 codebase intelligence + LLM to find the right source file and generate a code diff. The user reviews the diff in the Maintanium dashboard Preview tab, clicks Apply, and a branch + commit + PR is created on GitHub.

This closes the loop from "I see a problem" to "it's fixed via PR" entirely within Maintanium.

## 2. Key Files

### Backend (apps/api/src/preview/)
| File | Purpose |
|------|---------|
| `preview.constants.ts` | Event name constants |
| `preview.interfaces.ts` | DiffBlock/DiffHunk/DiffLine types, payload interfaces |
| `dto/setup-preview.dto.ts` | Validation DTO for preview setup |
| `dto/create-preview-change.dto.ts` | Validation DTO for change submission |
| `preview-api-key.guard.ts` | Custom guard for overlay endpoint authentication |
| `preview.service.ts` | CRUD operations for preview setup and change records |
| `preview-agent.service.ts` | File discovery (GitHub Code Search + dep graph) + LLM code generation |
| `preview.controller.ts` | REST endpoints (AuthGuard for dashboard, ApiKeyGuard for overlay) |
| `overlay.controller.ts` | Serves overlay.js script (no auth) |
| `overlay-script.ts` | Vanilla JS IIFE overlay script content |
| `preview.module.ts` | NestJS module registration |

### Schema (apps/api/src/database/schema/)
| File | Change |
|------|--------|
| `projects.ts` | Added `previewUrl`, `previewApiKey` columns |
| `preview-changes.ts` | New `preview_changes` table |
| `index.ts` | Re-exports preview-changes |

### GitHub (apps/api/src/github/)
| File | Change |
|------|--------|
| `github.interfaces.ts` | Added GitHubRef, GitHubCommitResponse, GitHubPullRequest |
| `github.service.ts` | Added getRef, createBranch, createOrUpdateFile, createPullRequest |

### Other Backend
| File | Change |
|------|--------|
| `main.ts` | CORS updated to allow cross-origin for overlay |
| `app.module.ts` | PreviewModule registered |

### Frontend (apps/web/src/components/)
| File | Purpose |
|------|---------|
| `projects/project-detail.tsx` | Added 'preview' tab + PreviewOverview import |
| `preview/preview-overview.tsx` | Full preview management UI |

## 3. Data Models

### projects table (modified)
```
previewUrl: text | null — the deployed site URL for preview
previewApiKey: text | null — publishable API key for overlay auth
```

### preview_changes table (new)
```
id: uuid PK
projectId: uuid FK → projects.id
currentUrl: text — page URL where element was captured
elementText: text — text content of captured element
cssSelector: text | null — generated CSS path
tagName: text — HTML tag name
pageContext: jsonb | null — auto-captured DOM context (pageTitle, nearestHeading, parentContext, outerHtml)
requestedChange: text — user's change description
status: enum(pending, ready, applied, dismissed, failed)
targetFilePath: text | null — AI-identified source file
originalContent: text | null — original file content
modifiedContent: text | null — modified file content
diff: jsonb | null — DiffBlock[] for frontend rendering
changeSummary: text | null — AI summary of change
branchName: text | null — created branch name
commitSha: text | null — commit SHA
prUrl: text | null — pull request URL
prNumber: integer | null — PR number
errorMessage: text | null — failure reason
createdAt, updatedAt: timestamptz
```

## 4. API Contracts

### Dashboard Endpoints (AuthGuard)

**PATCH /projects/:id/preview/setup**
- Body: `{ previewUrl: string }`
- Response: `{ previewUrl, previewApiKey }`

**POST /projects/:id/preview/setup/regenerate-key**
- Response: `{ previewApiKey }`

**GET /projects/:id/preview/changes**
- Response: `PreviewChange[]`

**POST /projects/:id/preview/changes/:changeId/apply**
- Response: updated `PreviewChange` with prUrl, prNumber

**PATCH /projects/:id/preview/changes/:changeId/dismiss**
- Response: updated `PreviewChange` with status='dismissed'

### Overlay Endpoint (PreviewApiKeyGuard)

**POST /projects/:id/preview/changes**
- Auth: `Bearer {previewApiKey}`
- Body: `{ currentUrl, elementText, cssSelector?, tagName, requestedChange, pageTitle?, nearestHeading?, parentContext?, outerHtml? }`
- Response: `{ id, status }`

### Public Endpoint (no auth)

**GET /preview/overlay.js**
- Response: JavaScript content

## 5. Sequence Diagrams

### Setup Flow
```
User → Dashboard → PATCH /projects/:id/preview/setup
  → PreviewService.setupPreview() → generate API key → update project
  → Return { previewUrl, previewApiKey }
User activates overlay via:
  Option A: Drag bookmarklet to bookmarks bar → click on site (zero-code)
  Option B: Add <script> tag to site HTML (advanced)
```

### Change Flow
```
User's Site → Overlay: hover + click element
  → Input panel: describe change
  → POST /projects/:id/preview/changes (ApiKey auth)
  → Create change record (status=pending)
  → Emit preview.change.submitted event
  → PreviewAgentService:
    1. Load M3 analysis
    2. Extract search terms from element text + page context
    3. GitHub Code Search: find files containing element text (up to 2 queries)
    4. Filter results to frontend categories via M3 file registry
    5. Trace imports via M3 dependency graph (BFS, depth 2)
    6. Fallback: deterministic URL/content matching if pipeline yields nothing
    7. Fetch file contents from GitHub
    8. LLM: generate modified code + diff
    9. Update change (status=ready)
Dashboard polls → sees ready change with diff
```

### Apply Flow
```
User → Dashboard → Apply button
  → POST /projects/:id/preview/changes/:changeId/apply
  → Get default branch SHA
  → Create branch: maintanium/preview-{id}
  → Get existing file SHA
  → Commit modified content
  → Create pull request
  → Update change (status=applied, prUrl, prNumber)
```

## 6. Visual Flow

```
[Deployed Site with Overlay]
  ↓ Annotate → click element → describe change
[API: Create Change (pending)]
  ↓ Event: preview.change.submitted
[Preview Agent: Code Search → Frontend Filter → Dep Trace → LLM]
  ↓ Update change (ready + diff)
[Dashboard: Preview Tab]
  ↓ User reviews diff → Apply
[GitHub: Branch + Commit + PR]
```

## 7. Inputs & Outputs

### Inputs
- **Setup:** HTTPS URL of deployed site
- **Change request:** Page URL, element text, CSS selector, tag name, change description, auto-captured page context (page title, nearest heading, parent context, outer HTML)
- **Apply:** User's GitHub token (via Firebase auth)

### Outputs
- **Bookmarklet** (primary) — drag-to-bookmarks-bar `javascript:void(...)` link with project config baked in
- **API key + script tag** for site embedding (advanced)
- **AI-generated diff** showing proposed code change
- **GitHub PR** with the modification applied

## 8. State & Ownership

- **Preview setup state** lives on the `projects` table (previewUrl, previewApiKey)
- **Change records** live in `preview_changes` table
- **Change lifecycle:** pending → ready → applied/dismissed (or failed at any step)
- **GitHub operations** use the authenticated dashboard user's token (Apply flow) or an org member's token (event-driven AI flow)

## 9. Security Notes

- **Two auth paths:** Dashboard endpoints use Firebase AuthGuard; overlay uses PreviewApiKeyGuard
- **API key is publishable:** Scoped to a single project, exposed in `<script>` tag. Not a secret (same pattern as Stripe publishable keys)
- **API key revocation:** Regenerate endpoint creates new key, old key immediately invalid
- **CORS:** Overlay endpoints accept cross-origin requests (security is via API key, not CORS)
- **LLM prompt safety:** User-supplied `requestedChange` goes ONLY in user message, never in system prompt
- **GitHub token for Apply:** Uses the authenticated dashboard user's own token, not a stored org token
- **Input validation:** All DTOs have @MaxLength, @IsNotEmpty, @IsUrl constraints

## 10. Dependencies

- **M3 Codebase Intelligence** (AnalysisModule) — required for AI file identification
- **GitHub Service** (GitHubModule) — file fetching + branch/commit/PR creation
- **Users Module** — GitHub token retrieval
- **Projects Module** — project auth + findByIdWithAuth
- **Anthropic SDK** — LLM code generation (graceful degradation if unavailable)
- **GitHub Code Search API** — file discovery via actual code content (10 req/min unauthenticated, 30 req/min authenticated)
- **@nestjs/event-emitter** — async event-driven AI processing
