# MaintainAI — Agent Architecture

7 agents across 4 layers. Every agent has a defined purpose, triggers, inputs/outputs, context access, interactions, and open questions.

---

## Data Flow Pipeline

```
Monitor → Orchestrator → Triage → Orchestrator → Implementation → Orchestrator → Validation → Orchestrator → Deployment
```

The Orchestrator sits at the centre of every handoff. Agents never call each other directly — they communicate through the Orchestrator, which manages the workflow state machine.

---

## System Layers

| Layer | Purpose | Agents |
|-------|---------|--------|
| **Control Layer** | Coordination & routing | Orchestrator Agent |
| **Detection Layer** | Issue discovery & classification | Monitor Agent, Triage Agent (BA) |
| **Knowledge Layer** | Shared context & documentation | Codebase Intelligence Agent |
| **Execution Layer** | Fix, validate & deploy | Implementation Agent, Validation Agent, Deployment Agent |

---

## 1. 🎯 Orchestrator Agent

**Layer:** Control
**Tagline:** *The brain that coordinates everything*

### Purpose

Routes work between agents, manages the lifecycle of every issue from detection to deployment, handles failures and retries, and ensures no task falls through the cracks.

### Triggers

- New issue detected by Monitor Agent
- New ticket classified by Triage Agent
- User submits visual annotation from Preview
- Implementation Agent completes a fix
- Validation Agent returns pass/fail result
- User approves or rejects a proposed fix

### Inputs & Outputs

**Inputs:** Events from all agents, user actions from dashboard, workflow state

**Outputs:** Task assignments to agents, status updates to dashboard, escalation decisions

### Schedule

Event-driven — reacts in real-time to all agent outputs and user actions.

### Context & Knowledge Access

Maintains a workflow state machine for every active issue. Reads from Codebase Intelligence for routing decisions (e.g., which specialist Implementation Agent to assign). Persists full audit trail.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| ← receives | Monitor Agent | Receives detected issues and alert events |
| → sends | Triage Agent | Routes incoming tickets/emails for classification |
| ← receives | Triage Agent | Receives classification result + routing recommendation |
| ← reads | Codebase Intelligence | Reads codebase context to determine which specialist to assign |
| → sends | Implementation Agent | Assigns implementation tasks with full context package |
| → sends | Validation Agent | Triggers validation after implementation completes |
| → sends | Deployment Agent | Triggers sandbox preview and production deployment |

### Improvements & Notes

- Without this agent, you'd need hardcoded if/else routing — the Orchestrator makes the system extensible and debuggable
- Should maintain a full audit trail of every decision for transparency and debugging
- Can implement smart retry logic: if Validation fails, it sends failure context back to Implementation Agent for a second attempt before escalating to human

### Open Questions

- Should the Orchestrator have LLM reasoning, or be rule-based? *(Recommendation: start rule-based, add LLM reasoning for edge cases in Phase 2)*

---

## 2. 🛡️ Monitor Agent

**Layer:** Detection
**Tagline:** *Always-on health surveillance*

### Purpose

Continuously monitors connected applications for security vulnerabilities, dependency health, performance degradation, SSL/certificate status, and uptime. Proactively detects issues before they become user-facing problems.

### Triggers

- Scheduled scan (configurable: hourly / daily / weekly)
- On-demand scan triggered by user
- Webhook from CVE database (new vulnerability published)
- External uptime check failure

### Inputs & Outputs

**Inputs:** Connected codebase (via Codebase Intelligence), dependency manifests, live application URL, CVE databases (NVD, GitHub Advisory)

**Outputs:** Issue reports with maintenance score (1–100), alerts with severity level, upgrade recommendations

### Schedule

Configurable per project: hourly (uptime), daily (dependencies, CVEs), weekly (full security audit). Customer can override.

### Scan Categories

| Category | Frequency | Description |
|----------|-----------|-------------|
| SSL/TLS | Daily | Certificate expiry tracking with 30/14/7-day warnings |
| CVE/Security | Daily | Dependencies checked against NVD + GitHub Advisory databases |
| Dependencies | Weekly | Outdated packages, deprecated APIs, EOL frameworks |
| Performance | Weekly | Core Web Vitals, load times, asset sizes |
| Uptime | Every 5 min | HTTP health checks, DNS resolution, response codes |
| Code Quality | On push | Linting, dead code, accessibility (triggered by Git webhook) |

### Context & Knowledge Access

Reads the Codebase Intelligence layer to understand what dependencies exist, what versions are in use, and what the deployment configuration looks like. Does NOT modify code — detection only.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| ← reads | Codebase Intelligence | Reads dependency inventory and configuration from Codebase Intelligence |
| → sends | Orchestrator | Sends detected issues with severity and maintenance score |

### Improvements & Notes

- Add predictive monitoring in Phase 3: if error rate trending up, alert before outage
- Cross-client anonymised pattern analysis: "Apps using React 17 + this package combination tend to break within 3 months"
- Scan frequency should be customer-configurable with sensible defaults, not one-size-fits-all

### Open Questions

- Should the Monitor Agent also scan for SEO regressions (broken meta tags, missing sitemaps)?
- How deep should CMS monitoring go? Plugin conflicts, theme compatibility, PHP version checks?

---

## 3. 📋 Triage Agent (BA)

**Layer:** Detection
**Tagline:** *Classifies every incoming request*

### Purpose

Acts as the AI business analyst. Ingests incoming tickets from Jira, Linear, support emails, and user-submitted visual annotations. Classifies each into a category and routes to the appropriate handler. Enriches tickets with codebase context before handoff.

### Triggers

- New Jira/Linear ticket created (webhook)
- Support email received (email integration)
- User submits visual annotation from Preview tab
- Monitor Agent detects an issue that needs classification
- Manual submission via dashboard

### Inputs & Outputs

**Inputs:** Raw ticket/email content, screenshots and attachments, user annotations from Visual Reporter, Codebase Intelligence context

**Outputs:** Classified ticket with category, enriched context package, routing recommendation, knowledge gap auto-response (if applicable)

### Schedule

Event-driven — processes incoming items within 30 seconds of receipt.

### Classification Categories

| Category | Routed To | Description |
|----------|-----------|-------------|
| **Bug / Code Fix** | Implementation Agent | Defect causing incorrect behaviour. Includes regression bugs. |
| **User Knowledge Gap** | Auto-response → User | User doesn't know how to use an existing feature. Generates guided walkthrough. |
| **Configuration Issue** | Implementation Agent (simple) or Guided Fix | Code is correct but settings/env vars/permissions are wrong. |
| **New Requirement** | Escalate to human with estimate | Feature or behaviour that doesn't exist yet. Advisory only. |
| **Duplicate** | Link to existing ticket | Same issue already reported. Merge and notify reporter. |

### Context & Knowledge Access

Reads Codebase Intelligence to understand what components exist, what similar tickets have been resolved before, and what the affected area of code looks like. Cross-references against a pattern database of past classifications.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| ← reads | Codebase Intelligence | Reads file documentation and schema context to understand affected areas |
| → sends | Orchestrator | Returns classification + enriched context package for routing |

### Improvements & Notes

- Add a "Duplicate" classification — if a similar ticket was already filed, link them instead of creating redundant work
- Confidence score on classification: if below 70%, flag for human BA review instead of auto-routing
- Knowledge gap responses should include a "This didn't help" button that reclassifies to Bug/Code Fix
- Email integration is powerful — customers forward support emails and the BA Agent handles triage automatically

### Open Questions

- Should the Triage Agent also estimate effort/cost, or leave that to the Implementation Agent?
- How to handle ambiguous tickets that could be either a bug or a knowledge gap?

---

## 4. 🧠 Codebase Intelligence Agent

**Layer:** Knowledge
**Tagline:** *The living memory of the entire codebase*

### Purpose

Generates and maintains a comprehensive, structured documentation layer for every connected codebase. This is the shared context that ALL other agents read from. Without it, every agent would need to re-parse the codebase from scratch for every task.

### Triggers

- First codebase sync (full documentation generation)
- Git push / merge event (incremental update)
- CMS plugin/theme update detected
- Manual re-scan triggered by user

### Inputs & Outputs

**Inputs:** Git repository contents, CMS theme/plugin files, database schemas (if accessible), API specs (OpenAPI, GraphQL schema)

**Outputs:** Structured documentation branch / knowledge base, file-level descriptions, component dependency graph, schema documentation, API surface map

### Schedule

Full scan on first sync. Incremental updates on every push/merge (via webhook). Full re-scan weekly to catch drift.

### Documentation Layers

| Layer | Description |
|-------|-------------|
| **File Registry** | Every file with: purpose, exports, dependencies, last modified. Think of it as a table of contents for the codebase. |
| **Component Graph** | How components/modules relate to each other. Which files import which. Dependency tree visualisation. |
| **Schema Documentation** | Database schemas, API contracts, TypeScript interfaces, GraphQL types — all documented and cross-referenced. |
| **Business Logic Map** | Plain-language descriptions of what each module DOES in business terms. "This file handles user authentication via OAuth2." |
| **Change History** | Per-file change frequency and recent modifications. Helps identify high-churn files that may need attention. |
| **Tech Stack Profile** | Framework versions, build tools, deployment config, environment variables referenced. |

### Context & Knowledge Access

This agent IS the context layer. It produces the documentation that all other agents consume. It maintains a living "documentation branch" in the repo (or equivalent for CMS) that is auto-updated on every code change.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| → serves | Monitor Agent | Monitor reads dependency inventory and config for scans |
| → serves | Triage Agent | Triage reads file docs and schemas to understand affected areas |
| → serves | Implementation Agent | Implementation reads component graph, schemas, and business logic to write correct fixes |
| → serves | Validation Agent | Validation reads expected behaviour and schemas to verify fixes |
| → serves | Orchestrator | Orchestrator reads tech stack and component ownership to route to correct specialist |

### Improvements & Notes

- This is arguably the most important agent — it's what makes every other agent dramatically better. Without it, you're just feeding raw code to LLMs and hoping for the best.
- The documentation should be versioned alongside the code so agents can reference "what did this file do before the last change?"
- For CMS sites: equivalent documentation covers installed plugins, theme structure, widget areas, custom post types, and configuration state
- Consider exposing this to the user as a "Codebase Health Report" — it has standalone value even without the fix pipeline

### Open Questions

- Should this documentation be committed as a branch in the user's repo, or stored in MaintainAI's database only?
- How to handle very large codebases (500k+ LOC)? Incremental indexing vs full scan trade-offs.
- Should users be able to manually annotate/correct the documentation?

---

## 5. 🔧 Implementation Agent

**Layer:** Execution
**Tagline:** *Writes the fix, documents the change*

### Purpose

Receives classified and enriched tickets, analyses the codebase context, generates a fix, and documents exactly what was changed and why. For complex or cross-functional issues, decomposes the task and coordinates specialist sub-agents.

### Triggers

- Orchestrator assigns an implementation task
- Validation Agent returns failure (retry with feedback)

### Inputs & Outputs

**Inputs:** Classified ticket with enriched context from Triage Agent, Codebase Intelligence (file docs, schemas, component graph), previous implementation attempts (if retry)

**Outputs:** Code diff / CMS changes, implementation summary (plain-language + technical), affected files list, estimated risk and maintenance tier, test suggestions

### Schedule

Event-driven — begins work immediately upon assignment from Orchestrator.

### Context & Knowledge Access

Reads extensively from Codebase Intelligence: the component graph to understand side effects, schemas to ensure data integrity, business logic map to preserve intended behaviour. Also reads the Triage Agent's enriched context for full issue understanding.

### Specialist Decomposition Model

For complex or cross-functional issues, the Lead Implementation Agent decomposes the task into sub-tasks and delegates to specialists:

| Specialist | Scope |
|------------|-------|
| 🎨 Frontend Specialist | UI components, styling, responsive layout, accessibility |
| ⚙️ Backend Specialist | API routes, business logic, authentication, server config |
| 🗄️ Database Specialist | Schema migrations, query optimisation, data integrity |
| 🚀 DevOps Specialist | CI/CD config, environment variables, deployment scripts, Docker |
| 📝 CMS Specialist | WordPress/Shopify theme edits, plugin configuration, CMS API calls |

**Cross-functional handling:** When a fix spans multiple domains (e.g., new API endpoint + frontend component + database migration), the Lead Agent creates a task plan, assigns sub-tasks to each specialist, collects results, verifies integration points, and assembles the unified diff. The Validation Agent then tests the integrated result.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| ← reads | Codebase Intelligence | Reads component graph, schemas, and business logic to write context-aware fixes |
| ← receives | Orchestrator | Receives task assignment with full context package |
| → sends | Orchestrator | Returns completed implementation with diff, docs, and risk assessment |
| → indirect | Validation Agent | Output is forwarded by Orchestrator to Validation Agent |

### Improvements & Notes

- The specialist model solves the cross-functional problem: a Lead Agent decomposes, delegates, and assembles — specialists don't need to understand the whole codebase
- Each implementation should output a "Test Plan" suggesting what the Validation Agent should check — this improves validation accuracy
- Implementation should document not just WHAT changed but WHY — this feeds back into Codebase Intelligence for future context
- For retries after validation failure: the agent receives specific failure reasons and adjusts — not a blind retry
- Consider caching common fix patterns (e.g., "update React from 18.2 to 18.3") to speed up recurring issues

### Open Questions

- How to handle cross-functional features: should the Lead Agent assemble the diff, or should each specialist commit independently?
- Should specialists be separate LLM instances with different system prompts, or one model with routing?
- What's the maximum retry count before escalating to human? *(Recommendation: 2 retries, then escalate)*

---

## 6. ✅ Validation Agent

**Layer:** Execution
**Tagline:** *Nothing ships without passing validation*

### Purpose

Independently verifies every implementation before it reaches the user. Runs automated tests, visual regression checks, security scans, and behavioural verification. Acts as the quality gate between implementation and deployment.

### Triggers

- Orchestrator forwards a completed implementation for validation

### Inputs & Outputs

**Inputs:** Code diff from Implementation Agent, test plan from Implementation Agent, Codebase Intelligence (expected behaviour, schemas), current test suite (if exists in repo)

**Outputs:** Pass/Fail verdict with detailed report, test results (existing suite + generated tests), visual regression screenshots, performance impact analysis, security scan results, specific failure reasons (for retry routing)

### Schedule

Event-driven — triggered by Orchestrator after implementation completes.

### Validation Layers

| Layer | Description |
|-------|-------------|
| **Existing Test Suite** | Run the project's own tests against the proposed changes. Report any failures. |
| **Generated Tests** | AI generates targeted test cases based on the Implementation Agent's test plan and the specific changes made. |
| **Visual Regression** | Screenshot comparison of key pages before/after the change. Flags visual differences beyond a threshold. |
| **Security Scan** | Check that the fix doesn't introduce new vulnerabilities, exposed secrets, or insecure patterns. |
| **Performance Check** | Measure impact on load time, bundle size, and Core Web Vitals. Flag if any metric degrades. |
| **Behavioural Verification** | Verify the fix actually resolves the original issue — not just that it doesn't break other things. |

### Context & Knowledge Access

Reads from Codebase Intelligence to understand expected behaviour. Also reads the Implementation Agent's documented intent to verify the fix addresses the original issue, not just that it doesn't break anything.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| ← reads | Codebase Intelligence | Reads expected behaviour and schemas to verify correctness |
| ← receives | Orchestrator | Receives implementation to validate |
| → sends | Orchestrator | Returns pass/fail with detailed report and failure reasons |

### Improvements & Notes

- Behavioural verification is the key differentiator — most CI/CD just checks "does it break?" but this checks "does it actually fix the reported issue?"
- Failure reports should be structured so the Implementation Agent can act on them directly — not just "test X failed" but "expected Y, got Z, likely because of line N"
- Validation outcomes should feed back into Codebase Intelligence to improve future context
- Consider a confidence score on the pass verdict: "Pass with 95% confidence" vs "Pass with 72% confidence — recommend human review"

### Open Questions

- How to handle projects with no existing test suite? *(Recommendation: generated tests only, with lower confidence)*
- Should visual regression thresholds be configurable per project?
- For CMS sites without code tests, what does validation look like? (Plugin compatibility check, visual regression, uptime check post-change)

---

## 7. 🚢 Deployment Agent

**Layer:** Execution
**Tagline:** *Sandbox preview → User approval → Production*

### Purpose

Manages the sandbox preview environment, presents the validated fix to the user, handles the approval workflow, and executes the production deployment upon approval. Also manages rollbacks if issues are detected post-deployment.

### Triggers

- Validation Agent returns PASS verdict
- User clicks Approve on a proposed fix
- User clicks Rollback on a deployed fix
- Auto-revert triggered (Tier 1 regression detected)

### Inputs & Outputs

**Inputs:** Validated code diff, validation report, user approval/rejection, deployment configuration from Codebase Intelligence

**Outputs:** Sandbox preview URL, production deployment, rollback execution, deployment status updates

### Schedule

Event-driven — triggers on validation pass and user approval.

### Deployment Pipeline

1. **Sandbox Creation** — Spins up an isolated preview environment with the proposed changes applied. Generates a unique preview URL.
2. **Preview Presentation** — Presents the sandbox in the dashboard with side-by-side comparison, visual diff overlay, and validation report.
3. **User Review** — User browses the preview, reviews the diff, and chooses: Approve / Reject / Request Changes.
4. **Production Deploy** — On approval: merges PR (Git) or applies changes via API (CMS). Monitors deployment pipeline.
5. **Post-Deploy Monitoring** — Watches for regressions for 24 hours. For Tier 1: auto-reverts if issues detected. For Tier 2+: alerts user.
6. **Cleanup** — Destroys sandbox environment. Updates Codebase Intelligence with new state.

### Context & Knowledge Access

Reads deployment configuration from Codebase Intelligence: CI/CD pipeline (Vercel, Netlify, GitHub Actions), CMS deployment method, environment variables, and deployment history.

### Interactions

| Direction | Agent | Description |
|-----------|-------|-------------|
| ← reads | Codebase Intelligence | Reads deployment config and CI/CD pipeline details |
| → updates | Codebase Intelligence | Updates codebase state after successful deployment |
| ← receives | Orchestrator | Receives validated implementation for preview deployment |
| → sends | Orchestrator | Returns deployment status, preview URL, or rollback confirmation |
| → triggers | Monitor Agent | Triggers post-deployment monitoring scan |

### Improvements & Notes

- Post-deploy monitoring is critical for the Tier 1 guarantee — this is what enables auto-revert
- Sandbox URL should be shareable (with auth) so team members can review before the owner approves
- Consider a "canary deployment" option for Tier 3 fixes: deploy to a subset of traffic first
- Deployment history with one-click rollback to any previous state, not just the last deployment

### Open Questions

- Infrastructure: own containers, Vercel/Netlify preview APIs, or hybrid? *(Deferred from earlier discussion)*
- How long should sandbox environments live? *(Current: 72 hours — is this right for all tiers?)*
- For CMS deployments without CI/CD, how to handle rollback reliably?

---

## Consolidated Open Questions

| # | Agent | Question |
|---|-------|----------|
| 1 | Orchestrator | Should the Orchestrator have LLM reasoning, or be rule-based? |
| 2 | Monitor | Should the Monitor Agent also scan for SEO regressions? |
| 3 | Monitor | How deep should CMS monitoring go? |
| 4 | Triage | Should the Triage Agent also estimate effort/cost? |
| 5 | Triage | How to handle ambiguous tickets (bug vs knowledge gap)? |
| 6 | Codebase Intelligence | Documentation stored in user's repo branch or MaintainAI DB only? |
| 7 | Codebase Intelligence | How to handle very large codebases (500k+ LOC)? |
| 8 | Codebase Intelligence | Should users be able to manually annotate/correct the docs? |
| 9 | Implementation | Should the Lead Agent assemble the diff, or specialists commit independently? |
| 10 | Implementation | Should specialists be separate LLM instances or one model with routing? |
| 11 | Implementation | Maximum retry count before human escalation? |
| 12 | Validation | How to handle projects with no existing test suite? |
| 13 | Validation | Should visual regression thresholds be configurable per project? |
| 14 | Validation | What does CMS validation look like without code tests? |
| 15 | Deployment | Infrastructure: own containers, Vercel/Netlify APIs, or hybrid? |
| 16 | Deployment | How long should sandbox environments live? |
| 17 | Deployment | How to handle CMS rollback without CI/CD? |