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

## Explicitly Out of Scope (M5b)

These were explicitly scoped out in the requirements and are not planned for near-term implementation:

| Item | Reason |
|------|--------|
| Auto-reply to reporters | No outbound email for this milestone |
| Attachment analysis | Email body only — attachments ignored |
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
