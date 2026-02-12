# Codebase Intelligence Agent — Backlog

Items identified during M3 implementation that are deferred to future milestones.

---

## LLM Usage & Cost Tracking

### Track Full Token Usage for Cost Calculation
- **Current:** `LlmService.trackCacheUsage()` only tracks cache write *count* and cache read *token sum*. Standard `input_tokens` and `output_tokens` from `response.usage` are not captured. Cache write token totals (`cache_creation_input_tokens`) are also not summed — only a counter of how many calls triggered a write. Stats are held in memory and logged once at the end of a run via `LlmService.getCacheStats()`, then lost.
- **What's missing:**
  1. `input_tokens` — not captured
  2. `output_tokens` — not captured
  3. `cache_creation_input_tokens` — raw token sum not tracked (only call count)
  4. **Persistence** — stats not stored in DB; lost after each analysis run
  5. **Cost derivation** — no model-to-price mapping to convert tokens to dollars
- **Action:**
  1. Extend `trackCacheUsage()` (or rename to `trackUsage()`) to accumulate all five token fields: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, plus a `callCount`
  2. Add a `llm_usage` JSONB column to `codebase_analyses` (or a separate `llm_usage_logs` table if per-call granularity is needed)
  3. Persist aggregated usage at the end of each analysis run alongside the results
  4. Optionally: add a utility to compute estimated cost from token counts + model name using known Anthropic pricing tiers
- **Impact:** `llm.service.ts` (usage tracking), `analysis.service.ts` (persist usage), schema migration (new column or table), optionally frontend (display cost on analysis overview)
- **Priority:** Medium — not blocking functionality, but important for cost visibility as analysis scales

---

## Incremental Analysis on Push

### Delta-Based Re-Analysis Instead of Full Tarball Re-Download
- **Current:** All three analysis triggers (project created, push webhook, manual rescan) call the same `runAnalysis()` pipeline: download full tarball → extract → run all P0/P1/P2 analyzers + LLM → overwrite the entire `codebase_analyses` record. The webhook push handler (`webhooks.service.ts:78-94`) receives `payload.commits[].added/modified/removed` — the exact list of changed files — but discards it and emits only `{ projectId }` to trigger a full re-run.
- **Goal:** On push events, only re-analyze changed files and merge results into the existing analysis, avoiding a full tarball download and full LLM re-run for minor changes.
- **Approach:**
  1. **Webhook**: Extract changed file paths from `payload.commits[].added`, `modified`, `removed` and pass them through the event payload
  2. **File download**: Use GitHub Contents API (`GET /repos/{owner}/{repo}/contents/{path}?ref={sha}`) to fetch individual changed files instead of a full tarball
  3. **Selective analyzer re-run**: Re-analyze only changed files in file registry (imports, exports, category). Remove deleted files. Add new files.
  4. **LLM**: Only send changed/added files for per-file LLM analysis, merge results into existing `fileRegistry[].llm` entries. Skip unchanged files entirely (biggest cost saving).
  5. **Re-derive dependents**: Some analyzers depend on the full file registry and must re-run after the registry is patched:
     - **Dependency graph** — must re-derive because changing one file's imports affects edges, blast radius, cycles
     - **API surface** — only re-scan changed files for route changes, merge into existing
     - **Content structure** — re-derive from updated registry + graph (cheap, in-memory)
  6. **Full re-run for aggregates**: Certain analyzers are cheap enough to always run in full since they scan manifest files, not source:
     - **Project metadata** — framework/language detection reads `package.json` etc. Fast, but only needs re-run if a manifest file changed
     - **Dependency inventory** — same as above, only if `package.json`/lockfile changed
     - **Patterns** — scans file contents for conventions. Could be scoped to changed files but pattern detection benefits from the full picture. Re-run in full (fast).
     - **Security metadata** — same reasoning as patterns, re-run in full
- **Key tradeoff — correctness vs. speed:**
  - Some analyzers (dependency graph, content structure) use the *full* file registry as input. Patching the registry incrementally and re-deriving these is correct as long as the registry patch is accurate.
  - Risk: if a changed file alters its exports, other files that import from it may now have stale import metadata. A fully correct incremental approach would need to identify "affected files" (reverse dependency lookup) and re-scan those too. This adds complexity.
  - **Pragmatic middle ground:** On push, fetch only changed files via Contents API, update their registry entries + LLM, then re-run the cheap static analyzers (graph, patterns, security, content structure) in full using the *existing* extracted data plus patched entries. Skip the expensive tarball download and skip LLM calls for unchanged files.
- **Data model change:** Add a `lastCommitSha` field to `codebase_analyses` to track which commit the current analysis reflects. This enables diffing against the new push's `before` SHA.
- **Impact:** `webhooks.service.ts` (pass changed files in event), `analysis.service.ts` (new `runIncrementalAnalysis()` path), `analysis.interfaces.ts` (extend event payload), `repo-downloader.service.ts` (add single-file download method), `llm-intelligence.analyzer.ts` (accept partial file list), schema migration (`lastCommitSha` column)
- **Priority:** Medium-High — the full tarball re-download + full LLM re-run on every push is the most expensive operation in the system. Incremental analysis would reduce both GitHub API load and LLM cost significantly for typical pushes (1-10 changed files).

---

## Audit Trail

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| 2026-02-11 | M3 UI improvements | LLM cost tracking gap identified | Backlog item created |
| 2026-02-11 | M3 UI improvements | Incremental analysis on push | Backlog item created |
