# Issue Detail (Investigation Page) — Backlog

## Current State (MVP Mock)

The investigation page shows a mock AI investigation report generated client-side from the finding's `scanner` type and `details` JSONB. No backend endpoint or real AI agent is involved.

**Route**: `/dashboard/projects/[id]/investigate/[findingId]`

### What's Mock Today

| Area | Current | Target |
|------|---------|--------|
| Diagnosis | Client-side generator per scanner type | Agent analyzes codebase + finding context |
| Proposed Fix | Static template with details interpolation | Agent proposes real fix based on repo code |
| Diff / Changes | Hardcoded diff templates | Agent generates real file diffs |
| Test Scope | Static checklist per scanner | Agent identifies affected test files |
| Apply Changes | Button visible, non-functional | Creates branch + PR with proposed changes |

---

## Backlog Items

### B1: Investigation API Endpoint

**Priority**: High
**Depends on**: M3 Analysis data, M4 Monitor findings

Create `POST /projects/:id/findings/:findingId/investigate` that:

1. Reads the finding + its `details` JSONB
2. Reads the latest codebase analysis (M3) for file context
3. Sends to AI agent with finding context + relevant source files
4. Returns `InvestigationData` structure (diagnosis, proposal, changes, testScope)
5. Caches result in a new `investigations` table to avoid re-running

**API Contract (Draft)**:

```
POST /projects/:id/findings/:findingId/investigate

Response:
{
  "id": "uuid",
  "findingId": "uuid",
  "status": "completed",
  "diagnosis": { ... },
  "proposal": { ... },
  "changes": [ ... ],
  "testScope": [ ... ],
  "createdAt": "ISO8601"
}
```

### B2: Agent-Populated Diagnosis

**Priority**: High
**Depends on**: B1

Replace mock `generateMockInvestigation()` with real API call. Agent should:

- Read the actual source files referenced in the finding
- Cross-reference with dependency graph from M3
- Produce a real root cause analysis, not template text

### B3: Agent-Generated Diffs

**Priority**: High
**Depends on**: B1

Agent generates real file diffs by:

- Reading the actual file content from GitHub (via existing file proxy)
- Producing unified diff format with real line numbers
- Supporting multi-file changes

### B4: Apply Changes (Create PR)

**Priority**: Medium
**Depends on**: B3

Wire the "Apply Changes" button to:

1. `POST /projects/:id/findings/:findingId/apply`
2. Backend creates a branch from default branch
3. Applies the diffs via GitHub API (create/update file contents)
4. Opens a PR with the investigation summary as description
5. Returns PR URL to frontend

### B5: Investigation Caching & Re-run

**Priority**: Low
**Depends on**: B1

- Cache investigation results in `investigations` table
- Show cached result on revisit (don't re-run agent)
- Add "Re-investigate" button to force fresh analysis
- Show "Investigated at: <timestamp>" metadata

### B6: Real Test Scope Discovery

**Priority**: Low
**Depends on**: B2, M3 analysis

Agent identifies actual test files by:

- Reading M3 dependency graph to find test files that import affected modules
- Suggesting specific test commands to run

---

## Data Model (Future)

```sql
CREATE TABLE investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES scan_findings(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | analyzing | completed | failed
  diagnosis JSONB,
  proposal JSONB,
  changes JSONB,
  test_scope JSONB,
  agent_model TEXT,         -- e.g. 'claude-sonnet-4-5-20250929'
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(finding_id)        -- one investigation per finding
);
```

---

## Key Files

**Frontend**:
- `apps/web/src/app/dashboard/projects/[id]/investigate/[findingId]/page.tsx` — route
- `apps/web/src/components/monitor/investigation-detail.tsx` — main page component
- `apps/web/src/components/monitor/investigation-mock.ts` — mock generator (to be replaced by B1)
- `apps/web/src/components/monitor/diff-view.tsx` — diff renderer (reused with real diffs)

**Backend (future)**:
- `apps/api/src/monitor/investigation.service.ts` — orchestrates agent call
- `apps/api/src/monitor/monitor.controller.ts` — adds investigate + apply endpoints
- `apps/api/src/database/schema/investigations.ts` — Drizzle schema

---

## Dependencies

- M3 Codebase Intelligence (analysis data for agent context)
- M4 Monitor Agent (findings data)
- GitHub API (file reading for agent, PR creation for apply)
- Anthropic SDK (agent calls)
