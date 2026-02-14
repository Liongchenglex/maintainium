# Maintanium — Reported Issues Backlog

Deferred features and enhancements, organized by area. Each item references the milestone or feature it relates to.

---

## Email Ingestion (M5b — deferred)

### Real Email Provider Integration
**Priority:** High
**Depends on:** M5b (current manual submit)

Replace the manual submit form with real inbound email processing via SendGrid Inbound Parse or Mailgun Routes.

**Scope:**
- Webhook endpoint to receive parsed emails from provider
- Extract project ID from the "to" address (e.g., `proj-{shortId}@inbound.maintainium.dev`)
- Email provider webhook signature verification (HMAC)
- DNS MX record setup for inbound domain
- Map parsed payload (sender, subject, body) to `CreateIssueDto`

**Open decisions:**
- Which provider: SendGrid Inbound Parse vs Mailgun Routes
- Inbound email domain/subdomain (requires DNS MX record)

---

### Inbound Email Configuration UI
**Priority:** High
**Depends on:** Real Email Provider Integration

One-time setup flow per project:
- "Configure Support Email" button in Reported Issues tab
- System generates unique inbound email address for the project
- Display address + instructions to forward or publish
- Store address in `projects.inboundEmailAddress` column (column defined in requirements but not yet added to schema)

---

### Email Deduplication
**Priority:** Medium
**Depends on:** Real Email Provider Integration

Deduplicate by (sender + subject hash) within a 5-minute window. Duplicate emails return 200 OK silently.

---

### HTML Email Parsing
**Priority:** Medium
**Depends on:** Real Email Provider Integration

Strip HTML tags from HTML-only emails to extract plain text content. Currently only plain text is supported via the manual submit form.

---

### Email Rate Limiting
**Priority:** Medium
**Depends on:** Real Email Provider Integration

Max 100 emails per project per hour. Return 429 after limit to prevent abuse.

---

### Forwarded Email Parsing
**Priority:** Low
**Depends on:** Real Email Provider Integration

Parse forwarded email content (From:/Subject:/Date: headers embedded in body) as additional context for triage.

---

## GitHub Integration (M5b → M5c)

### PR Creation from Diagnosed Issues
**Priority:** High
**Depends on:** M5b (diagnosis with `code-fix` + proposed changes), M2 (GitHub API)

Wire the "Implement Changes" button to actually create a GitHub branch and PR with the proposed file changes. Currently shows "coming soon" tooltip.

**Scope:**
- Create branch from default branch
- Apply proposed changes (file diffs from `proposedChanges` JSONB)
- Create PR with diagnosis summary as description
- Link PR back to the issue record
- Reuses M4 Apply Changes pattern (same `InvestigationData` format)

---

## Agent Improvements (M5b+)

### Complication Score Calibration — Separate Complexity from Urgency
**Priority:** High
**Depends on:** M5b (diagnosis agent)

The Diagnosis Agent currently conflates urgency with complexity in `complicationScore`. An urgent but simple issue (e.g., "production login is broken" — one-line env fix) may receive a high complication score because the LLM interprets urgency signals as complexity. This causes the "Implement Changes" button to be disabled (score > 6) for issues that are actually trivial to fix.

**Scope:**
- Refine the diagnosis system prompt to explicitly separate urgency (how quickly it needs attention) from complexity (how many files/concepts are involved in the fix)
- Add clear examples in the prompt: "A critical production outage caused by a missing env variable is complicationScore 1–2 (trivial fix), even though the issue is urgent"
- Consider adding a separate `urgency` field to `DiagnosisLlmResponse` so the UI can display both dimensions independently
- Evaluate whether `priority` (from triage) already captures urgency, making `complicationScore` purely about implementation complexity

---

### Diagnosis Agent Access to Actual Source Code ✅ IMPLEMENTED
**Priority:** High (Completed)
**Status:** Implemented

The Diagnosis Agent now fetches actual source code from GitHub for the top 5 most important area files. This enables the LLM to reference real code in its root cause analysis and produce accurate diffs in `proposedChanges.changes[]`.

**What was implemented:**
- `buildM3Context()` — extracts rich structured context from M3 analysis (architecture, API routes, data model, patterns, detailed file analysis with purpose/functions/blast radius)
- `fetchAreaFileContents()` — scores area files by blast radius + category priority, fetches top 5 via GitHub API, base64 decodes, truncates to 200 lines
- `userId` added to `IssueTriagedPayload` for GitHub token lookup
- `GitHubModule` added to `IssuesModule` imports
- `max_tokens` increased from 4096 → 8192
- Graceful degradation: no token → M3 data only; no M3 → issue text + vector memory only

---

### Prompt Caching for Agent LLM Calls
**Priority:** High
**Depends on:** M5b (triage + diagnosis agents)

Apply the B13 prompt caching pattern (`cache_control: { type: 'ephemeral' }`) to triage and diagnosis agent system messages. Shared project context (M3 analysis, feature areas) is repeated across issues — caching would reduce cost significantly for projects with high issue volume.

---

### Increase Vector Memory Retrieval to Top 5
**Priority:** Low
**Depends on:** M5b (vector memory)

Requirements specify top 5 similar past issues; current implementation retrieves top 3. Increase limit and evaluate whether additional context improves diagnosis quality.

---

### Vector Memory Pruning / TTL
**Priority:** Medium
**Depends on:** M5b (vector memory)

Add a retention policy for vector memory embeddings:
- Prune embeddings older than N days or keep only the most recent M per feature area
- Prevent unbounded growth of `agent_memory_embeddings` table
- Consider relevance decay — older resolutions may not apply to current codebase

---

### Stale Analysis Warning
**Priority:** Medium
**Depends on:** M5b (diagnosis), M3 (analysis)

When M3 analysis is older than the latest push event, show a warning on the diagnosis: "Codebase may have changed since analysis. Re-analyze recommended." Prevents acting on outdated proposed changes.

---

## Frontend UX (M5b+)

### Real-Time Status Updates
**Priority:** Medium
**Depends on:** M5b (frontend)

Currently the user must manually refresh to see triage/diagnosis progress. Add polling or SSE to update issue status in real time as agents complete their work (`new` → `triaged` → `diagnosed`).

---

### Issue Status Filtering Enhancements
**Priority:** Low
**Depends on:** M5b (frontend)

- Bulk actions (resolve multiple, reassign multiple)
- Sort by priority, date, complication score
- Search by subject or reporter email
- Pagination for projects with many issues

---

## Issue Submission Enhancements (M5b+)

### Image Upload in Issue Description
**Priority:** Medium
**Depends on:** M5b (current manual submit)

Allow reporters to attach screenshots and images when submitting issues. Visual context (error screenshots, UI glitches, console output) significantly improves triage accuracy and diagnosis quality.

**Scope:**
- Add file upload field to `SubmitIssueForm` (accept image types: PNG, JPG, GIF, WebP)
- Backend: store images in object storage (S3 or local) with project-scoped paths
- Add `attachments` JSONB column to `reported_issues` table (array of `{ url, filename, contentType, sizeBytes }`)
- Pass image URLs to triage and diagnosis agents as part of the LLM prompt (Anthropic vision API supports image content blocks)
- Size limits: max 5MB per image, max 3 images per issue
- Frontend: image preview in issue detail card

**Open decisions:**
- Storage backend: S3 vs local filesystem vs Supabase Storage
- Whether to send images to LLM directly (vision API) or extract text via OCR first
- Image compression/resize before storage

---

### Custom Knowledgebase Upload per Feature Area
**Priority:** Medium
**Depends on:** M5b (diagnosis agent), M3 (feature area discovery)

Allow project owners to upload custom knowledgebase files (markdown, text, PDF) per feature area. These documents augment the M3-derived context with domain-specific knowledge that static analysis cannot capture — business rules, known workarounds, internal runbooks, API quirks, historical decisions, etc.

**Scope:**
- New UI section per feature area: "Feature SME Knowledgebase" with file upload + list
- Backend: `feature_knowledgebases` table (`project_id`, `feature_area`, `filename`, `content_text`, `uploaded_by`, `created_at`)
- File processing: extract text from uploaded files (markdown passthrough, PDF text extraction)
- Diagnosis agent integration: include knowledgebase content in the system prompt alongside M3 context, capped at ~5,000 tokens per feature area
- Per-file size limit: 500KB, max 10 files per feature area
- CRUD: upload, list, delete knowledgebase entries per feature area

**Why not just rely on M3?**
M3 analyzes code structure — it discovers file purposes, API routes, and dependency graphs. But it cannot know:
- Business rules ("refunds are only allowed within 30 days")
- Known workarounds ("the payment gateway returns 500 on duplicate idempotency keys — retry once")
- Historical decisions ("we chose Redis over Memcached because of pub/sub requirements")
- Internal runbooks ("if Stripe webhook fails, check the dead letter queue first")

Custom knowledgebases let each feature area SME inject this tribal knowledge so the diagnosis agent produces context-aware recommendations.

**Open decisions:**
- File format support: markdown-only vs markdown + PDF + plain text
- Whether to embed knowledgebase content in vector memory (searchable) or include inline (always present)
- Token budget allocation between M3 context, knowledgebase, and source code in the diagnosis prompt

---

## Explicitly Out of Scope (M5b)

These were explicitly scoped out in the requirements and are not planned for near-term implementation:

| Item | Reason |
|------|--------|
| Auto-reply to reporters | No outbound email for this milestone |
| Attachment analysis (email) | Email body only — attachments from email ingestion ignored (image upload via manual submit is a backlog item) |
| Multi-language email parsing | English only |
| Email thread / conversation tracking | Each email = one issue |
| SLA tracking / response time metrics | Not a support desk tool |
| Real-time chat / live support | Email-only channel |
| Custom triage rules / manual classification logic | Fully LLM-driven |

---

## Notes

- Items are roughly ordered by priority within each section
- "Depends on" indicates which milestone or feature must be complete before work can begin
- Real email ingestion is the highest-priority deferred work — it unlocks the full automated pipeline
- Refer to `docs/features/reported_issues/feature.md` for current implementation details
- Refer to `docs/features/reported_issues/requirements.md` for the full requirements including deferred acceptance criteria
