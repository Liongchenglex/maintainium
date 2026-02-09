# MaintainAI — MVP Milestones

The PRD is the source of truth for what each feature must do. This document defines **delivery order** and **integration-level criteria** that span multiple PRD sections. For acceptance criteria on any specific feature, refer to the PRD.

---

## M1: Auth + Empty Dashboard

**PRD Coverage:** None — auth is infrastructure not covered by a PRD section.

**Integration Criteria (not in PRD):**
- Firebase Auth handles email/password + GitHub OAuth; GitHub access token encrypted and stored for later repo access (no second OAuth prompt during onboarding)
- Session persists via HTTP-only cookie; all `/api/*` and `/dashboard/*` routes reject unauthenticated requests with 401 or redirect
- User record, default organization, and org_members entry created in PostgreSQL on first login
- Dashboard renders an empty state prompting repo connection

**Demo:** Sign up → log in → see empty dashboard → log out → confirm `/dashboard` redirects to `/login`.

---

## M2: GitHub Connection + Codebase Browsing

**PRD Coverage:**
- **FR-1.1** (Git Repository Connection) — OAuth connection, repo selection, webhook registration, branch awareness

**Integration Criteria (not in PRD):**
- Stored GitHub token from M1 auth flow is used directly — no second OAuth prompt
- Project record in PostgreSQL links the org (from M1) to the connected repo
- Expired/revoked tokens surface a clear "Reconnect GitHub" prompt rather than a generic error

**Demo:** Click "Connect Repo" → select a private repo → browse file tree → see project card on dashboard.

---

## M3: Codebase Intelligence Layer

**PRD Coverage:**
- **FR-1.3** (Unified Application Profile) — tech stack summary, dependency inventory, config health check, deployment method detection, health baseline

**Integration Criteria (not in PRD):**
- Analysis triggers automatically when a repo is connected (M2), not as a separate manual step
- Incremental re-analysis fires on push webhook (webhook registered in M2)
- Codebase Intelligence output is stored in a queryable format that M4's scanner and M6's Implementation Agent can read — this is the shared context layer described in the Agent Architecture
- Manual "Re-scan" button available on the project detail page

**Demo:** Connect a repo → Application Profile page auto-populates within 5 minutes → push a commit → see the profile update.

---

## M4: Diagnostic Scanner + Issue Detection

**PRD Coverage:**
- **FR-2.1** (Automated Issue Detection) — scheduled and on-demand scans across security, dependencies, performance categories
- **FR-2.2** (Maintenance Scoring System) — 1–100 score mapping to liability tiers

**Integration Criteria (not in PRD):**
- Scanner reads from Codebase Intelligence (M3) rather than re-parsing raw files — dependency inventory, config, and tech stack are already indexed
- Duplicate detection: re-scanning does not create duplicate issues for already-tracked problems
- Each issue record links to the specific project (M2) and references affected files from the codebase index (M3)

**Demo:** Click "Run Scan" on a repo with known outdated deps → issues appear with scores and severity → run again → no duplicates created.

---

## M5: Issue Dashboard with Maintenance Scoring

**PRD Coverage:**
- **FR-2.3** (Diagnosis Report Generation) — structured report with plain-language explanation, root cause, recommended action, effort estimate, risk assessment
- **FR-7.1** (Application Portfolio View) — health status indicators, quick stats, connection status
- **FR-7.3** (Issue Feed & Detail View) — chronological feed, issue cards with score/tier/classification, detail view with full report
- **Section 10.1** (Liability Tiers) — tier classification displayed per issue

**Integration Criteria (not in PRD):**
- Issue feed is populated by scanner output (M4) — this is the first time detection and dashboard are wired together end-to-end
- Portfolio view aggregates health status across multiple projects (if user has connected more than one repo in M2)
- Tier badge on each issue correctly reflects the scoring from M4, using the tier boundaries defined in Section 10.1

**Demo:** Dashboard shows issue feed with scores and tiers → click an issue → see plain-language report → filter by severity → dismiss an issue → portfolio view reflects updated health status.

---

## M6: Implementation Agent (Fix Generation)

**PRD Coverage:**
- **FR-4.1** (Fix Generation) — receives classified issue with context, analyzes codebase, generates code diff with explanation
- **FR-4.4** (Version Upgrade Management) — minor/patch auto-fix, major version migration plan
- **Section 10.1** (Liability Tiers) — Tier 1–2 get auto-fix, Tier 3–4 get advisory only

**Integration Criteria (not in PRD):**
- Implementation Agent reads from Codebase Intelligence (M3) for context — file descriptions, dependency graph, tech stack — not just raw file contents
- Fix is linked to the parent issue (M4/M5) in the database; issue status transitions from "open" to "fix-proposed"
- Tier 3–4 issues show "View Advisory" instead of "Generate Fix" — boundary enforced by the scoring from M4
- Fix generation failures (LLM timeout, invalid diff) handled gracefully with error message and retry option

**Demo:** Open a Tier 1 issue → click "Generate Fix" → see code diff with explanation within 2 minutes → open a Tier 4 issue → see advisory with no fix option.

---

## M7: Sandbox Preview Environment

**PRD Coverage:**
- **FR-1.4** (Sandbox Preview Environment) — preview generation, side-by-side comparison, interactive preview, automated visual diff, time-limited, isolated
- **FR-7.2** (Sandbox Preview Integration) — split-screen in dashboard, navigate preview within dashboard, visual diff overlay

**Integration Criteria (not in PRD):**
- Sandbox is created automatically when a fix is generated (M6) — not a separate manual trigger
- Sandbox deploys the codebase at the current HEAD with the proposed diff applied
- Sandbox destruction triggers on approval/rejection (M8) or 72-hour expiry, whichever comes first
- Resource cleanup is verified: no orphaned containers or preview deployments persist after destruction

**Demo:** Generate a fix (M6) → sandbox URL appears within 3 minutes → open side-by-side in dashboard → click through the preview → visual diff highlights changes.

---

## M8: Approval Workflow + PR Creation

**PRD Coverage:**
- **FR-4.3** (Pull Request & Approval Workflow) — PR with summary, diff, preview URL, test results, risk assessment, approve/reject/request changes
- **FR-7.4** (Approval Workflow) — approve, reject, request changes, escalate actions; batch approval for low-risk fixes

**Integration Criteria (not in PRD):**
- Approval creates a PR on the user's GitHub repo using the token stored in M1 — if token is expired, prompt reconnection instead of silent failure
- "Request Changes" sends user feedback back to the Implementation Agent (M6) as additional context for a second attempt, generating a new sandbox (M7)
- Approval is audited: who approved, when, which sandbox URL, stored in the database
- Role check enforced: only org owners/admins (from M1's org structure) can approve

**Demo:** Review sandbox → click Approve → PR appears on GitHub with summary and preview link → on a second issue, click Request Changes → type feedback → new fix generated with new sandbox.

---

## M9: Deployment Pipeline + Rollback

**PRD Coverage:**
- **FR-1.6** (Deployment Integration) — PR merge triggers CI/CD, one-click rollback, deployment status tracking
- **Section 10.2** (Guarantee Mechanics) — Tier 1 auto-revert, Tier 2 re-fix

**Integration Criteria (not in PRD):**
- Merge is triggered by approval action (M8) — the transition from "approved" to "deploying" to "deployed" is a continuous flow, not a separate step
- Deployment status is detected via GitHub webhook or CI status check API — the platform does not need to run the CI/CD itself
- Post-deployment health check (ping production URL, verify 200) runs automatically and feeds result back to the issue record
- Tier 1 auto-revert creates and merges a revert PR without user intervention, then notifies the user — this is the first guarantee mechanic that's actually enforced

**Demo:** Approve a fix → PR merges → dashboard shows deployment progress → deployment succeeds → click Rollback → revert PR created and merged → production reverts.

---

## M10: Proactive Monitoring + Notifications

**PRD Coverage:**
- **FR-6.1** (Continuous Health Monitoring) — uptime, SSL, DNS, Core Web Vitals
- **FR-6.2** (Dependency Intelligence) — daily CVE scans, EOL tracking, upgrade urgency
- **FR-6.4** (Alert & Notification System) — email notifications, severity levels, snooze/dismiss

**Integration Criteria (not in PRD):**
- Scheduled scans use the same scanner from M4 but triggered by cron/Cloud Scheduler instead of user click — scan logic is reused, not reimplemented
- New issues from scheduled scans appear in the same issue feed (M5) as on-demand scan results — no separate "monitoring" view
- Notifications link directly to the issue detail page in the dashboard (M5) — one click from email to action
- Monitoring runs reliably for projects the user hasn't visited in weeks — no dependency on active sessions

**Demo:** Connect a repo → wait for daily scan to fire → receive email notification for a new issue → click link → land on issue detail page in dashboard.

---

## M11: Landing Page + Billing + Production Hardening

**PRD Coverage:**
- **Section 11** (Non-Functional Requirements) — performance, security, reliability targets
- **FR-7.5** (Cost & Effort Transparency) — estimated costs, monthly summary

**Integration Criteria (not in PRD):**
- Landing page → signup → onboarding → dashboard is a single unbroken flow with no dead ends
- Free tier enforces limits (project count, scan frequency) that gate access to features built in M2–M10
- Paid tier unlocks the full pipeline; Stripe webhook confirms subscription status before allowing gated actions
- Rate limiting, error logging, secret management, and HTTPS are applied across all routes from M1–M10 — not bolted on as a separate layer
- Basic load test: 50 concurrent users performing dashboard + scan operations without degraded response times

**Demo:** Visit landing page → sign up on free tier → hit project limit → upgrade via Stripe → add another project → confirm billing page shows correct plan and usage.

---

## Milestone Dependency Chain

```
M1 (Auth) → M2 (GitHub) → M3 (Codebase Intel) → M4 (Scanner) → M5 (Issue Dashboard)
                                                                        ↓
M6 (Fix Gen) → M7 (Sandbox) → M8 (Approval + PR) → M9 (Deploy + Rollback)
                                                              ↓
                                                      M10 (Monitoring) → M11 (Ship It)
```

**Early ship opportunity:** M1–M5 is a standalone diagnostic tool. You can put it in front of users to validate demand before building the fix pipeline.

---

## PRD Sections Deferred Past MVP

These PRD sections are intentionally excluded from the MVP milestone plan. They belong in Phase 2+.

| PRD Section | Reason for Deferral |
|---|---|
| **FR-1.2** (CMS Platform Connection) | MVP focuses on GitHub repos only. WordPress/Shopify adds significant scope. |
| **FR-1.5** (CMS Sandbox Handling) | Dependent on FR-1.2. |
| **PRD 3** (BA Agent / Ticket Intelligence) | Requires Jira/Linear integrations. Core value is provable without ticket ingestion. |
| **PRD 5** (Visual Issue Reporter) | Browser extension is a separate product surface. Core loop works without it. |
| **FR-6.3** (Predictive Maintenance) | Requires cross-client data. Not possible until sufficient user base. |
| **FR-7.6** (User Roles & Permissions) | Single-user/founder use case works with owner-only. Team roles are Phase 2. |
| **Section 10.2 — Tier 3/4 Guarantees** | Tier 3 revert-only and Tier 4 advisory display are included, but the partner developer referral network is Phase 2. |