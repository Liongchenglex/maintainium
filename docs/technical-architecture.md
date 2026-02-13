# Maintanium — Technical Architecture (GCP)

Infrastructure, database schemas, API surface, and event-driven communication.

---

## Table of Contents

1. [GCP Services](#1-gcp-services)
2. [Database Schemas](#2-database-schemas)
3. [API Routes](#3-api-routes)
4. [Event Bus (Pub/Sub)](#4-event-bus-pubsub)

---

## 1. GCP Services

### Compute & Runtime

| Service | Use Case | Why |
|---------|----------|-----|
| **Cloud Run** | API Gateway, Dashboard Backend, Webhook Receivers | Serverless, scales to zero, pay-per-request. Perfect for variable traffic patterns. |
| **GKE Autopilot** | Agent Runtime (long-running agent workers) | Agents need persistent processes with GPU access for LLM inference. Autopilot handles node scaling. |
| **Cloud Functions (2nd gen)** | Lightweight event handlers — Git webhooks, CMS webhooks, scheduled scans | Sub-second cold starts for event-driven triggers. Cost-effective for sporadic webhook traffic. |

### Data & Storage

| Service | Use Case | Why |
|---------|----------|-----|
| **Cloud SQL (PostgreSQL 15)** | Primary relational database — users, orgs, projects, tickets, agent results | ACID transactions, complex queries, joins across entities. Managed backups and HA. |
| **Firestore** | Real-time dashboard state, agent workflow state, live collaboration | Real-time listeners for instant dashboard updates. Document model fits workflow state well. |
| **Cloud Storage (GCS)** | Codebase snapshots, screenshots, visual diffs, sandbox artifacts, scan reports | Cheap, durable blob storage. Lifecycle policies auto-delete expired sandbox artifacts. |
| **Memorystore (Redis)** | Agent task queue, caching, rate limiting, session store | Sub-ms latency for queue operations. Pub/Sub for real-time agent coordination. |

### Messaging & Orchestration

| Service | Use Case | Why |
|---------|----------|-----|
| **Cloud Pub/Sub** | Agent-to-agent communication, event bus for all system events | Decouples agents. Guaranteed delivery. Dead letter queues for failed processing. Fan-out for multiple consumers. |
| **Cloud Tasks** | Scheduled scans, delayed retries, time-based triggers | Reliable task scheduling with configurable retry policies. Handles the Monitor Agent's scan schedule. |
| **Workflows** | Multi-step agent pipelines (Orchestrator logic) | Orchestrates the full issue lifecycle: detect → triage → implement → validate → deploy. Built-in retry, error handling, and audit logging. |

### AI & ML

| Service | Use Case | Why |
|---------|----------|-----|
| **Vertex AI** | LLM hosting for agent reasoning (Claude/Gemini via Model Garden) | Managed LLM endpoints. Can run Claude via Anthropic's API or Gemini natively. Handles scaling and batching. |
| **Cloud Natural Language** | Ticket parsing, email classification, sentiment detection | Pre-built NLP for initial ticket triage before LLM agent takes over. Cost-effective for simple classification. |

### Security & Networking

| Service | Use Case | Why |
|---------|----------|-----|
| **Cloud Armor** | WAF, DDoS protection for API endpoints | Protects the public-facing API and webhook receivers. |
| **Secret Manager** | API keys, OAuth tokens, LLM API keys, database credentials | Versioned secrets with automatic rotation. Agents read secrets at runtime, never stored in code. |
| **IAM + Workload Identity** | Service-to-service auth, least-privilege access for each agent | Each agent runs with minimal permissions. No shared service accounts. |
| **VPC + Private Service Connect** | Network isolation for database, Redis, and internal services | Agents communicate over private network. Database never exposed to internet. |

### CI/CD & Sandbox

| Service | Use Case | Why |
|---------|----------|-----|
| **Cloud Build** | Build sandbox preview images, run test suites | Serverless builds. Triggered by agent pipeline when fix is ready for validation. |
| **Cloud Run (ephemeral)** | Sandbox preview environments | Each preview is a Cloud Run revision with a unique URL. Auto-deletes after 72 hours via TTL policy. |
| **Artifact Registry** | Container images for sandbox previews and agent workers | Managed Docker registry. Vulnerability scanning on push. |

### Observability

| Service | Use Case | Why |
|---------|----------|-----|
| **Cloud Logging** | Centralised logs for all agents, API, and infrastructure | Structured logging with agent ID, task ID, and workflow ID for traceability. |
| **Cloud Monitoring** | Metrics, alerts, dashboards for platform health | Custom metrics for agent performance: task duration, success rate, LLM token usage. |
| **Cloud Trace** | Distributed tracing across agent pipeline | Trace a single issue from detection through to deployment across all agent hops. |

---

## 2. Database Schemas

12 tables across 5 groups. PostgreSQL 15 on Cloud SQL with pgvector extension.

### Schema Groups

| Group | Tables |
|-------|--------|
| **Identity & Access** | organizations, users, org_members |
| **Projects & Connections** | projects, connections |
| **Knowledge Layer** | codebase_intelligence |
| **Issue Pipeline** | issues, fixes, validations, deployments |
| **Observability** | agent_tasks, scan_results, activity_log |

### Relationships

```
organizations  ──1:N──▶  org_members
users          ──1:N──▶  org_members
organizations  ──1:N──▶  projects
projects       ──1:N──▶  connections
projects       ──1:N──▶  codebase_intelligence
projects       ──1:N──▶  issues
projects       ──1:N──▶  scan_results
projects       ──1:N──▶  activity_log
issues         ──1:N──▶  fixes
fixes          ──1:1──▶  validations
fixes          ──1:N──▶  deployments
issues         ──1:N──▶  agent_tasks
```

---

### `organizations`

Multi-tenant root entity. All data is scoped to an organization.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| name | VARCHAR(255) | | Organization display name |
| slug | VARCHAR(100) | UNIQUE | URL-safe identifier |
| plan | ENUM | | 'free', 'starter', 'pro', 'enterprise' |
| billing_email | VARCHAR(255) | | Billing contact |
| stripe_customer_id | VARCHAR(255) | NULLABLE | Stripe integration |
| settings | JSONB | | Org-level settings (default scan freq, notification prefs) |
| created_at | TIMESTAMPTZ | | Creation timestamp |
| updated_at | TIMESTAMPTZ | | Last modification |

**Indexes:** `slug (UNIQUE)`, `plan`, `created_at`

---

### `users`

User accounts. A user can belong to multiple organizations via org_members.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| email | VARCHAR(255) | UNIQUE | Login email |
| name | VARCHAR(255) | | Display name |
| avatar_url | TEXT | NULLABLE | Profile image URL |
| auth_provider | ENUM | | 'email', 'google', 'github' |
| auth_provider_id | VARCHAR(255) | NULLABLE | External OAuth ID |
| password_hash | TEXT | NULLABLE | Null if OAuth user |
| email_verified | BOOLEAN | | Email confirmation status |
| last_login_at | TIMESTAMPTZ | NULLABLE | Last login timestamp |
| created_at | TIMESTAMPTZ | | Account creation |

**Indexes:** `email (UNIQUE)`, `auth_provider, auth_provider_id`

---

### `org_members`

Junction table linking users to organizations with roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| org_id | UUID | **FK** → organizations.id | Organization reference |
| user_id | UUID | **FK** → users.id | User reference |
| role | ENUM | | 'owner', 'admin', 'developer', 'viewer' |
| invited_at | TIMESTAMPTZ | | Invitation timestamp |
| joined_at | TIMESTAMPTZ | NULLABLE | Null until accepted |

**Indexes:** `org_id, user_id (UNIQUE)`, `user_id`, `role`

---

### `projects`

A connected application — either a Git repo or CMS site. Core entity that everything else links to.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| org_id | UUID | **FK** → organizations.id | Owning organization |
| name | VARCHAR(255) | | Project display name |
| slug | VARCHAR(100) | | URL-safe identifier within org |
| source_type | ENUM | | 'github', 'gitlab', 'wordpress', 'shopify' |
| source_url | TEXT | | Repository URL or site URL |
| source_config | JSONB | | Connection-specific config (branch, API endpoint, etc.) |
| tech_stack | JSONB | NULLABLE | Detected: {framework, language, runtime, cms_version} |
| health_status | ENUM | | 'healthy', 'warning', 'critical', 'unknown' |
| last_scan_at | TIMESTAMPTZ | NULLABLE | Last diagnostic scan completion |
| scan_schedule | VARCHAR(50) | | Cron expression or preset: 'hourly', 'daily', 'weekly' |
| settings | JSONB | | Per-project settings (auto-approve rules, notification overrides) |
| is_active | BOOLEAN | | Soft delete / pause monitoring |
| created_at | TIMESTAMPTZ | | When project was connected |
| updated_at | TIMESTAMPTZ | | Last modification |

**Indexes:** `org_id, slug (UNIQUE)`, `org_id, health_status`, `source_type`, `last_scan_at`, `is_active`

---

### `connections`

OAuth tokens and API credentials for external services. Encrypted at rest.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| project_id | UUID | **FK** → projects.id | Associated project |
| provider | ENUM | | 'github', 'gitlab', 'wordpress', 'shopify', 'jira', 'linear', 'slack' |
| access_token_encrypted | BYTEA | | AES-256 encrypted OAuth/API token |
| refresh_token_encrypted | BYTEA | NULLABLE | Encrypted refresh token (OAuth) |
| token_expires_at | TIMESTAMPTZ | NULLABLE | Token expiry for auto-refresh |
| scopes | TEXT[] | | Granted permission scopes |
| metadata | JSONB | | Provider-specific metadata (install ID, webhook secret) |
| status | ENUM | | 'active', 'expired', 'revoked' |
| created_at | TIMESTAMPTZ | | Connection established |
| last_used_at | TIMESTAMPTZ | NULLABLE | Last API call made |

**Indexes:** `project_id`, `provider, status`

---

### `codebase_intelligence`

Living documentation generated by the Codebase Intelligence Agent. One record per file per project version.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| project_id | UUID | **FK** → projects.id | Parent project |
| file_path | TEXT | | Relative path from repo root |
| file_hash | VARCHAR(64) | | SHA-256 of file contents (for change detection) |
| layer | ENUM | | 'file_registry', 'component_graph', 'schema', 'business_logic', 'tech_stack' |
| documentation | JSONB | | Structured doc: {purpose, exports, dependencies, description} |
| embedding | VECTOR(1536) | NULLABLE | Embedding for semantic search (pgvector) |
| last_analyzed_at | TIMESTAMPTZ | | When this file was last analyzed |
| commit_sha | VARCHAR(40) | NULLABLE | Git commit this analysis is based on |

**Indexes:** `project_id, file_path (UNIQUE per version)`, `project_id, layer`, `embedding (ivfflat/hnsw)`

> 💡 Uses pgvector extension for semantic search. Agents query: "find files related to authentication" and get ranked results.

---

### `issues`

Every detected issue or incoming ticket. Central entity for the agent pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| project_id | UUID | **FK** → projects.id | Affected project |
| external_id | VARCHAR(255) | NULLABLE | Jira/Linear/GitHub issue ID |
| source | ENUM | | 'monitor', 'triage', 'visual_reporter', 'manual', 'jira', 'linear', 'email' |
| title | VARCHAR(500) | | Issue title |
| description | TEXT | | Full description (plain text or markdown) |
| category | ENUM | | 'security', 'dependency', 'performance', 'availability', 'code_quality', 'compatibility', 'bug', 'config', 'knowledge_gap', 'new_requirement' |
| severity | ENUM | | 'critical', 'high', 'medium', 'low', 'info' |
| maintenance_score | INTEGER | | 1–100 maintenance complexity score |
| liability_tier | ENUM | | 'tier_1', 'tier_2', 'tier_3', 'tier_4' |
| status | ENUM | | 'open', 'triaging', 'implementing', 'validating', 'pending_approval', 'approved', 'deploying', 'resolved', 'rejected', 'escalated' |
| classification | ENUM | NULLABLE | 'bug', 'knowledge_gap', 'config', 'new_requirement', 'duplicate' |
| classification_confidence | DECIMAL(3,2) | NULLABLE | Triage Agent confidence 0.00–1.00 |
| affected_files | TEXT[] | NULLABLE | List of affected file paths |
| affected_components | TEXT[] | NULLABLE | Component names from codebase intelligence |
| diagnosis | JSONB | NULLABLE | {root_cause, impact, risk_if_ignored, plain_summary} |
| metadata | JSONB | | Source-specific data (screenshots, annotations, email headers) |
| duplicate_of_id | UUID | **FK** → issues.id, NULLABLE | If duplicate, links to original |
| resolved_by_fix_id | UUID | **FK** → fixes.id, NULLABLE | Fix that resolved this issue |
| assigned_agent | VARCHAR(50) | NULLABLE | Currently assigned agent ID |
| escalated_to_user_id | UUID | **FK** → users.id, NULLABLE | If escalated to human |
| created_at | TIMESTAMPTZ | | When issue was detected/reported |
| updated_at | TIMESTAMPTZ | | Last status change |
| resolved_at | TIMESTAMPTZ | NULLABLE | When issue was resolved |

**Indexes:** `project_id, status`, `project_id, severity`, `project_id, liability_tier`, `project_id, created_at DESC`, `status, assigned_agent`, `external_id`, `duplicate_of_id`, `maintenance_score`

---

### `fixes`

Code changes proposed by the Implementation Agent. A single issue may have multiple fix attempts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| issue_id | UUID | **FK** → issues.id | Issue this fix addresses |
| project_id | UUID | **FK** → projects.id | Target project |
| attempt_number | INTEGER | | 1, 2, 3... (retry tracking) |
| specialist_type | ENUM | NULLABLE | 'frontend', 'backend', 'database', 'devops', 'cms', 'lead' |
| implementation_summary | TEXT | | Plain-language summary of what was changed and why |
| technical_summary | TEXT | | Technical description for developers |
| diff | TEXT | | Unified diff of all changes |
| changed_files | JSONB | | [{path, action: 'modified'\|'added'\|'deleted', additions, deletions}] |
| estimated_risk | ENUM | | 'low', 'medium', 'high' |
| test_plan | JSONB | NULLABLE | Suggested test cases for Validation Agent |
| branch_name | VARCHAR(255) | NULLABLE | Git branch created for this fix |
| pr_url | TEXT | NULLABLE | Pull request URL (GitHub/GitLab) |
| llm_model_used | VARCHAR(100) | | Which model generated the fix |
| llm_tokens_used | INTEGER | | Token count for cost tracking |
| generation_duration_ms | INTEGER | | Time to generate the fix |
| status | ENUM | | 'generating', 'ready', 'validating', 'validated', 'failed', 'approved', 'deployed', 'reverted' |
| created_at | TIMESTAMPTZ | | When fix generation started |
| completed_at | TIMESTAMPTZ | NULLABLE | When fix generation completed |

**Indexes:** `issue_id`, `project_id, status`, `created_at DESC`, `specialist_type`

---

### `validations`

Results from the Validation Agent. One validation per fix attempt.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| fix_id | UUID | **FK** → fixes.id | Fix being validated |
| verdict | ENUM | | 'pass', 'fail', 'pass_with_warnings' |
| confidence | DECIMAL(3,2) | | 0.00–1.00 confidence in verdict |
| test_results | JSONB | | {existing_suite: {passed, failed, skipped}, generated_tests: {passed, failed}} |
| visual_regression | JSONB | | {pages_checked, diffs_found, screenshot_urls} |
| security_scan | JSONB | | {vulnerabilities_found, severity_breakdown} |
| performance_impact | JSONB | | {lcp_before, lcp_after, bundle_size_before, bundle_size_after} |
| behavioral_check | JSONB | | {original_issue_resolved: bool, explanation} |
| failure_reasons | JSONB | NULLABLE | Structured failure details for Implementation Agent retry |
| duration_ms | INTEGER | | Validation runtime |
| created_at | TIMESTAMPTZ | | Validation started |
| completed_at | TIMESTAMPTZ | NULLABLE | Validation completed |

**Indexes:** `fix_id`, `verdict`

---

### `deployments`

Sandbox previews and production deployments. Tracks the full deployment lifecycle.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| fix_id | UUID | **FK** → fixes.id | Fix being deployed |
| project_id | UUID | **FK** → projects.id | Target project |
| environment | ENUM | | 'sandbox', 'production' |
| preview_url | TEXT | NULLABLE | Sandbox preview URL |
| cloud_run_revision | VARCHAR(255) | NULLABLE | Cloud Run revision ID for sandbox |
| status | ENUM | | 'building', 'live', 'approved', 'deploying_prod', 'deployed', 'failed', 'reverted', 'expired' |
| approved_by_user_id | UUID | **FK** → users.id, NULLABLE | Who approved the deployment |
| approved_at | TIMESTAMPTZ | NULLABLE | Approval timestamp |
| deployed_at | TIMESTAMPTZ | NULLABLE | Production deploy timestamp |
| reverted_at | TIMESTAMPTZ | NULLABLE | If/when reverted |
| revert_reason | TEXT | NULLABLE | Why it was reverted |
| expires_at | TIMESTAMPTZ | NULLABLE | Sandbox TTL (72 hours from creation) |
| post_deploy_check | JSONB | NULLABLE | {uptime_ok, visual_regression_ok, error_rate_change} |
| created_at | TIMESTAMPTZ | | When deployment started |

**Indexes:** `fix_id`, `project_id, environment, status`, `expires_at`, `status`

---

### `agent_tasks`

Audit trail of every agent action. The Orchestrator creates and manages these records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| workflow_id | UUID | | Groups all tasks for a single issue lifecycle |
| issue_id | UUID | **FK** → issues.id | Related issue |
| agent_type | ENUM | | 'orchestrator', 'monitor', 'triage', 'codebase', 'implementation', 'validation', 'deployment' |
| agent_instance_id | VARCHAR(100) | NULLABLE | Specific agent pod/instance for debugging |
| task_type | VARCHAR(100) | | What the agent was asked to do: 'scan', 'classify', 'generate_fix', 'validate', 'deploy_sandbox' |
| input_payload | JSONB | | What context was sent to the agent |
| output_payload | JSONB | NULLABLE | What the agent returned |
| status | ENUM | | 'pending', 'running', 'completed', 'failed', 'retrying', 'cancelled' |
| error_message | TEXT | NULLABLE | Error details if failed |
| retry_count | INTEGER | | Number of retries attempted |
| llm_model | VARCHAR(100) | NULLABLE | LLM model used (if applicable) |
| llm_input_tokens | INTEGER | NULLABLE | Input tokens for cost tracking |
| llm_output_tokens | INTEGER | NULLABLE | Output tokens for cost tracking |
| duration_ms | INTEGER | NULLABLE | Task execution time |
| started_at | TIMESTAMPTZ | NULLABLE | When agent started work |
| completed_at | TIMESTAMPTZ | NULLABLE | When agent finished |
| created_at | TIMESTAMPTZ | | When task was created by Orchestrator |

**Indexes:** `workflow_id`, `issue_id`, `agent_type, status`, `created_at DESC`, `agent_type, created_at DESC`

> 💡 Critical for debugging, cost tracking, and performance monitoring. Every LLM call is logged with token counts.

---

### `scan_results`

Results from Monitor Agent scheduled scans. One record per scan run per project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| project_id | UUID | **FK** → projects.id | Scanned project |
| scan_type | ENUM | | 'security', 'dependency', 'performance', 'uptime', 'code_quality', 'full' |
| trigger | ENUM | | 'scheduled', 'manual', 'webhook', 'post_deploy' |
| findings_count | INTEGER | | Number of issues found |
| findings | JSONB | | [{type, severity, title, details, affected_file, maintenance_score}] |
| summary | JSONB | | {critical, high, medium, low, info} |
| duration_ms | INTEGER | | Scan duration |
| created_at | TIMESTAMPTZ | | Scan start time |
| completed_at | TIMESTAMPTZ | | Scan completion time |

**Indexes:** `project_id, scan_type, created_at DESC`, `project_id, created_at DESC`

---

### `activity_log`

User-facing event log displayed in the dashboard Activity tab.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | **PK** | Primary key |
| project_id | UUID | **FK** → projects.id | Related project |
| issue_id | UUID | **FK** → issues.id, NULLABLE | Related issue (if applicable) |
| actor_type | ENUM | | 'agent', 'user', 'system' |
| actor_id | VARCHAR(255) | | Agent type or user ID |
| action | VARCHAR(100) | | 'issue_detected', 'fix_proposed', 'fix_approved', 'deployed', 'reverted', 'scan_completed' |
| title | VARCHAR(500) | | Human-readable event title |
| details | JSONB | NULLABLE | Additional structured details |
| created_at | TIMESTAMPTZ | | When event occurred |

**Indexes:** `project_id, created_at DESC`, `issue_id`

---

## 3. API Routes

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/signup` | Email/password registration |
| POST | `/auth/login` | Email/password login → JWT |
| GET | `/auth/oauth/:provider` | Initiate OAuth flow (google/github) |
| GET | `/auth/oauth/:provider/callback` | OAuth callback |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/orgs/:orgId/projects` | List all projects with health status |
| POST | `/orgs/:orgId/projects` | Connect new project (triggers onboarding scan) |
| GET | `/orgs/:orgId/projects/:id` | Project detail with stats |
| PATCH | `/orgs/:orgId/projects/:id` | Update settings, scan schedule |
| DELETE | `/orgs/:orgId/projects/:id` | Disconnect project |
| POST | `/orgs/:orgId/projects/:id/scan` | Trigger manual scan |

### Issues

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:id/issues` | List issues (filterable: status, severity, tier) |
| GET | `/projects/:id/issues/:issueId` | Issue detail with diagnosis |
| POST | `/projects/:id/issues` | Manually create an issue |
| POST | `/projects/:id/issues/:issueId/escalate` | Escalate to human |

### Fixes & Approvals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues/:issueId/fixes` | List fix attempts for an issue |
| GET | `/fixes/:fixId` | Fix detail with diff, summary, preview URL |
| POST | `/fixes/:fixId/approve` | Approve → triggers production deploy |
| POST | `/fixes/:fixId/reject` | Reject → destroys sandbox |
| POST | `/fixes/:fixId/request-changes` | Request changes → new fix attempt |
| POST | `/projects/:id/batch-approve` | Batch approve Tier 1 fixes |

### Deployments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fixes/:fixId/deployments` | List deployments (sandbox + prod) |
| POST | `/deployments/:id/rollback` | Rollback a production deployment |

### Webhooks (Inbound)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/github` | GitHub push/PR events |
| POST | `/webhooks/gitlab` | GitLab push/MR events |
| POST | `/webhooks/jira` | Jira ticket created/updated |
| POST | `/webhooks/linear` | Linear issue events |
| POST | `/ingest/email` | Support email ingestion (SendGrid/Mailgun) |

### Visual Reporter

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:id/annotations` | Submit visual annotation from browser extension |
| POST | `/upload/screenshot` | Upload annotated screenshot → GCS |

### Real-time

| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws/projects/:id` | WebSocket: live issue updates, agent progress, deployment status |
| WS | `/ws/fixes/:fixId` | WebSocket: fix generation progress, validation status |

---

## 4. Event Bus (Pub/Sub)

All agent communication flows through Cloud Pub/Sub topics. Agents never call each other directly — they publish events and subscribe to topics. The Orchestrator subscribes to most topics and manages the workflow state machine.

| Topic | Publishers | Subscribers | Description |
|-------|-----------|-------------|-------------|
| `project.connected` | API | Codebase Intelligence | New project connected → trigger full codebase scan |
| `code.pushed` | Webhook Handler | Codebase Intelligence, Monitor Agent | Git push → incremental doc update + scan |
| `scan.completed` | Monitor Agent | Orchestrator | Scan finished with findings → create issues |
| `issue.created` | Orchestrator, API | Orchestrator | New issue → begin triage workflow |
| `issue.classified` | Triage Agent | Orchestrator | Issue classified → route to handler |
| `fix.requested` | Orchestrator | Implementation Agent | Issue assigned for fix → begin implementation |
| `fix.completed` | Implementation Agent | Orchestrator | Fix ready → trigger validation |
| `validation.requested` | Orchestrator | Validation Agent | Fix needs validation → run test suite |
| `validation.completed` | Validation Agent | Orchestrator | Validation done → deploy sandbox or retry |
| `deployment.sandbox.ready` | Deployment Agent | Orchestrator, Dashboard WS | Sandbox live → notify user for review |
| `deployment.approved` | API (user action) | Deployment Agent | User approved → deploy to production |
| `deployment.production.done` | Deployment Agent | Monitor Agent, Orchestrator | Deployed → begin post-deploy monitoring |

### Firestore Collections (Real-time State)

These collections live in Firestore for real-time dashboard updates:

**`/workflows/{workflowId}`** — Workflow state machine for each active issue.
- `issueId`, `currentStep` (triaging | implementing | validating | deploying), `agentStates` (map of agent statuses), `history` (array of step transitions), `createdAt`, `updatedAt`

**`/projects/{projectId}/live_status`** — Real-time project health for dashboard cards.
- `healthStatus`, `openIssues`, `pendingApprovals`, `lastScanAt`, `activeAgents` (array of currently running agents)

**`/fixes/{fixId}/progress`** — Live progress tracking for fix generation and validation.
- `status`, `generationProgress` (0–100), `validationProgress` (0–100), `currentStep`, `logs` (array of timestamped messages)