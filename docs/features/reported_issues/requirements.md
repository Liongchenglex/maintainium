# M5b: Email-to-Triage Agent Pipeline — Formal Requirements

---

## 1. Context & Intent

### Who is this for?
- **Primary user**: Project owner / engineering lead who receives customer support emails
- **Secondary actor**: End customer who reports issues via email
- **System actors**: Triage Agent (LLM), Feature BA Agent (LLM), Implementation Agent

### Problem being solved
Customer-reported issues arrive via email and require manual triage, diagnosis, and routing. This is slow, error-prone, and context-lossy. Maintanium automates this: an AI triage agent classifies inbound emails using codebase intelligence (M3), routes to a feature-specific BA agent that diagnoses with full code context, and surfaces actionable fixes (or non-code solutions) directly in the dashboard.

### Non-goals (explicitly out of scope)
- Real-time chat / live support (email-only for this milestone)
- Auto-replying to reporters (no outbound emails)
- Multi-language email parsing (English only)
- Attachment analysis (email body only)
- Custom triage rules or manual classification logic
- Email thread / conversation tracking (each email = one issue)
- SLA tracking or response time metrics

---

## 2. Actual Flow (End-to-End)

### Setup Flow (one-time per project)
1. User navigates to project → "Reported Issues" tab
2. User clicks "Configure Support Email"
3. System generates a unique inbound email address for the project (e.g., `proj-{shortId}@inbound.maintainium.dev`)
4. User is shown the address + instructions to forward or publish it
5. System stores the address in the project record

### Issue Reporting Flow (per email)
1. Customer sends email to (or CC's) the project's inbound address
2. Email provider (SendGrid/Mailgun) receives email and POSTs parsed content to our webhook endpoint
3. Webhook handler extracts project ID from the "to" address, validates, and stores the raw issue as `status: 'new'`
4. System emits `issue.received` event

### Triage Flow
5. Triage agent picks up `issue.received` event
6. Triage agent loads M3 analysis data for the project (feature areas from `apiSurface`, `contentStructure`, `patterns`, `llmIntelligence.businessFlows`)
7. Triage agent classifies the issue into a feature area + assigns priority
8. If classification succeeds → issue `status: 'triaged'`, assigned area + priority stored
9. If classification fails (spam, out-of-scope, unclear) → issue `status: 'needs-review'` with triage notes explaining why
10. System emits `issue.triaged` event

### Diagnosis Flow
11. BA agent for the assigned feature area picks up `issue.triaged` event
12. BA agent loads: M3 analysis data for the feature area's files, vector memory (past issues + resolutions for this area), issue details
13. BA agent produces a diagnosis:
    - **Recommendation type**: one of `code-fix`, `user-education`, `needs-clarification`, `escalation`
    - **Diagnosis summary**: root cause analysis
    - **Complication score**: 1–10
    - **Proposed changes** (if `code-fix`): files to modify + diff hunks (M4 format)
    - **Education content** (if `user-education`): suggested documentation/FAQ response
    - **Clarification request** (if `needs-clarification`): specific questions to ask the reporter
14. Diagnosis stored, issue `status: 'diagnosed'`
15. BA agent stores this issue + diagnosis in its vector memory for future context
16. System emits `issue.diagnosed` event

### User Review Flow
17. User sees the diagnosed issue in "Reported Issues" tab with full diagnosis card
18. User reviews the diagnosis:
    - If recommendation is `code-fix` and complication score ≤ 6 → "Implement Changes" button is enabled
    - If recommendation is `code-fix` and complication score 7–10 → "Implement Changes" button is disabled with explanation ("This change is too complex for auto-implementation. Manual implementation recommended.")
    - If recommendation is `user-education` → user sees suggested response to forward to reporter
    - If recommendation is `needs-clarification` → user sees questions to ask reporter
    - If recommendation is `escalation` → user sees escalation notes
19. User can click "Reassign" to manually change the feature area → triggers re-diagnosis by the new area's BA agent

### Implementation Flow
20. User clicks "Implement Changes" (only for `code-fix`, score ≤ 6)
21. System generates proposed changes in M4 Apply Changes format (file diffs)
22. User reviews diff → clicks "Create PR"
23. System creates a branch and PR with the proposed changes (future — same as M4 pattern)

---

## 3. Step-by-Step Behaviour (Deterministic)

### 3.1 Email Webhook Processing
- If "to" address does not match any project → reject with 200 OK (do not expose project existence)
- If "to" address matches but project has no M3 analysis → store issue as `status: 'new'`, triage with degraded context (project metadata only)
- If email body is empty → store issue with subject only, flag as `needs-review`
- If email is a duplicate (same sender + same subject within 5 minutes) → ignore, return 200 OK

### 3.2 Triage Agent Classification
- Triage agent receives: email subject, email body (plain text, max 5000 chars), project's M3 feature areas
- Feature areas are derived from M3 analysis: `llmIntelligence.businessFlows[].name`, `apiSurface.routes` grouped by path prefix, `contentStructure.pageTree` grouped by directory
- If triage agent confidence > 0.7 → assign to top feature area
- If triage agent confidence 0.4–0.7 → assign to top area but flag as `low-confidence`
- If triage agent confidence < 0.4 → mark as `needs-review`
- Priority assignment: triage agent assigns `critical`, `high`, `medium`, or `low` based on issue content (keywords like "cannot login", "data loss", "crash" increase priority)

### 3.3 BA Agent Diagnosis
- BA agent receives: issue details, M3 analysis data filtered to the assigned feature area's files, past 20 resolved issues for this area (from vector memory)
- Recommendation type selection:
  - If issue describes a bug with reproducible symptoms and code changes can fix it → `code-fix`
  - If issue is a misunderstanding of existing functionality → `user-education`
  - If issue lacks sufficient detail to diagnose → `needs-clarification`
  - If issue crosses multiple areas or requires architectural changes → `escalation`
- Complication score criteria:
  - 1–3: Single file change, config tweak, simple logic fix
  - 4–6: Multi-file change, new logic, moderate refactor
  - 7–10: Architectural change, cross-service impact, schema migration, breaking change
- For `code-fix`: BA agent produces proposed changes in `InvestigationData.changes[]` format (file path, language, hunks with add/remove/context lines)

### 3.4 Manual Reassign
- User selects a new feature area from dropdown (populated from M3 analysis areas)
- Previous diagnosis is archived (not deleted)
- Issue `status` reset to `triaged` with new area
- `issue.triaged` event emitted → new BA agent diagnoses

### 3.5 Vector Memory
- Each feature area has a separate vector namespace
- On diagnosis completion: issue summary + diagnosis + resolution are embedded and stored
- On new diagnosis: past similar issues are retrieved (top 5 by cosine similarity) and included in BA agent context
- Storage: pgvector extension in PostgreSQL
- Embedding model: same Anthropic API (or OpenAI embeddings if cheaper — decision deferred to architecture)

---

## 4. Edge Cases

### Email Ingestion
- **HTML-only email (no plain text)**: Strip HTML tags, extract text content
- **Very long email (>5000 chars)**: Truncate to first 5000 chars for triage, store full body
- **Email with only attachments, no body**: Treat as body = subject only, mark `needs-review`
- **Multiple recipients (CC'd)**: Extract project address from To/CC fields, process once
- **Forwarded email**: Parse the forwarded content (From:/Subject:/Date: headers in body) as part of context
- **Rapid-fire duplicate emails**: Deduplicate by (sender + subject hash) within 5-minute window

### Triage
- **Project has no M3 analysis**: Triage with project name and basic metadata only, lower confidence expected
- **No feature areas discovered**: All issues go to a default "General" area
- **Email is clearly spam**: Mark as `needs-review` with note "Potentially spam — no actionable content detected"

### BA Diagnosis
- **Feature area has no code files in M3**: BA agent operates in degraded mode with project-level context only
- **Vector memory is empty (first issue for this area)**: BA agent diagnoses without historical context — normal cold start
- **BA agent fails (LLM error)**: Issue stays in `triaged` status, retry up to 2 times with exponential backoff, then mark `diagnosis-failed`

### Implementation
- **M3 analysis is stale (code has changed since analysis)**: Show warning "Codebase may have changed since analysis. Re-analyze recommended."
- **Proposed changes conflict with current code**: Handled at PR creation time — git conflict resolution is out of scope

---

## 5. Failure Modes

### Webhook Endpoint
- Email provider POST fails validation → 200 OK (prevent retries for invalid data)
- Email provider POST with valid data but DB write fails → 500 (provider will retry)
- Rate limit: max 100 emails per project per hour → 429 after limit (prevents abuse)

### Triage Agent
- LLM API call fails → retry 2x with backoff → if still fails, issue stays `new`, logged as error
- LLM returns malformed response → fallback to `needs-review` with parsing error note
- LLM timeout (>30s) → retry once → if still fails, mark `needs-review`

### BA Agent
- LLM API call fails → retry 2x with backoff → if still fails, mark `diagnosis-failed`
- Vector memory query fails → proceed without historical context (graceful degradation)
- LLM produces invalid complication score → default to 5 (medium)

### Auth & Authorization
- Webhook endpoint: validated by email provider signature (SendGrid/Mailgun HMAC)
- All UI endpoints: require auth (existing AuthGuard)
- Users can only see issues for projects they own (existing project ownership check)
- Reassign: only project owner can reassign

---

## 6. Acceptance Criteria

### Email Ingestion
- AC1: Given a project with a configured inbound email, when an email is sent to that address, then a new reported issue appears in the Reported Issues tab within 30 seconds
- AC2: Given a duplicate email (same sender + subject within 5 min), when received, then it is silently ignored
- AC3: Given an email to an unknown address, when the webhook fires, then it returns 200 OK and no issue is created

### Triage
- AC4: Given a new issue, when the triage agent runs, then the issue is assigned a feature area and priority within 60 seconds
- AC5: Given an untriageable email (spam/unclear), when the triage agent runs, then the issue is marked `needs-review` with an explanation note
- AC6: Given a project with M3 analysis, when triage runs, then feature areas shown match the M3-discovered areas

### BA Diagnosis
- AC7: Given a triaged issue, when the BA agent runs, then a diagnosis is produced with: recommendation type, summary, and complication score
- AC8: Given a `code-fix` recommendation with score ≤ 6, when the user views the issue, then the "Implement Changes" button is enabled
- AC9: Given a `code-fix` recommendation with score 7–10, when the user views the issue, then the "Implement Changes" button is disabled with explanation
- AC10: Given a `user-education` recommendation, when the user views the issue, then suggested documentation/FAQ content is displayed
- AC11: Given a `needs-clarification` recommendation, when the user views the issue, then clarification questions are displayed

### Reassign
- AC12: Given a diagnosed issue, when the user clicks "Reassign" and selects a new area, then the previous diagnosis is archived and a new BA diagnosis begins
- AC13: Given a reassigned issue, when the new BA agent completes, then the new diagnosis replaces the displayed one

### Vector Memory
- AC14: Given a resolved issue, when its diagnosis is stored, then subsequent issues in the same area include it as context
- AC15: Given a feature area with 20+ resolved issues, when a new issue arrives, then the top 5 most similar past issues are retrieved

### Implementation
- AC16: Given a `code-fix` with score ≤ 6 and an "Implement Changes" click, then proposed file changes are shown in diff format (M4 pattern)

---

## 7. Open Questions / Assumptions

### Resolved
- ✅ Email provider: Inbound webhook (SendGrid or Mailgun) — decided
- ✅ Feature areas source: Auto-discovered from M3 analysis — decided
- ✅ High complication (7–10): Block auto-implement — decided
- ✅ Scope: Full pipeline — decided
- ✅ Re-triage mechanism: Manual reassign — decided
- ✅ Agent memory: Full vector memory (pgvector) — decided
- ✅ Implementation agent: Reuse M4 Apply Changes pattern — decided
- ✅ Non-triageable emails: Park as `needs-review` — decided

### Open (must resolve before implementation)
- **Q1**: Which email provider — SendGrid Inbound Parse or Mailgun Routes? (Affects webhook payload format)
- **Q2**: Embedding model for vector memory — Anthropic embeddings, OpenAI `text-embedding-3-small`, or `pgvector` with a local model?
- **Q3**: Inbound email domain — what domain/subdomain to use? (Requires DNS MX record setup)
- **Q4**: Should we build with a real email provider from day 1, or start with a "manual submit" form and add email integration later?
- **Q5**: PR creation in step 23 — is this actually wired to GitHub API, or stays as mock/"coming soon" like M4?

---

## Data Model (Preview — to be finalized in Architecture phase)

### New Tables
- `reported_issues` — stores inbound email issues + triage/diagnosis results
- `issue_diagnoses` — BA agent diagnosis output (one per issue, archived on reassign)
- `agent_memory_embeddings` — pgvector table for BA agent context memory

### Modified Tables
- `projects` — add `inboundEmailAddress` (text, nullable)

---

## Batch Breakdown (Suggested — to be finalized in Architecture phase)

- **B1**: Database schema + inbound email webhook endpoint
- **B2**: Triage agent (LLM classification + event-driven)
- **B3**: BA diagnosis agent + vector memory (pgvector)
- **B4**: Frontend — replace mock data with real API, diagnosis cards, reassign flow
- **B5**: Implementation agent integration (M4 Apply Changes)
- **B6**: Email configuration UI in Reported Issues tab
