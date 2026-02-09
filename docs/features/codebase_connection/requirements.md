# M2: GitHub Connection + Repository Browsing — Requirements

**PRD Coverage:** FR-1.1 (Git Repository Connection) — GitHub only
**Milestone:** M2

---

## 1. Context & Intent

### Who is this for?

Authenticated MaintainAI users (from M1) who want to connect their GitHub repositories so the platform can monitor and maintain their codebases.

### Why does it matter?

Before MaintainAI can diagnose, monitor, or fix anything, it needs access to the user's codebase. GitHub connection is the entry point to the entire platform value chain. Without it, the dashboard remains empty.

### What is explicitly NOT included?

- **GitLab support** — deferred to a future milestone
- **CMS platform connections** (WordPress, Shopify, Webflow) — deferred past MVP per milestones.md
- **Codebase intelligence / analysis** — M3 (Application Profile generation)
- **Monorepo detection and scoping** — Phase 2
- **Creating feature branches or PRs** — M8
- **Repository write operations** — M2 is read-only access
- **Team/org management UI** — M2 creates a default personal org automatically; no management screens
- **Issue scanning or diagnostics** — M4

---

## 2. Actual Flow (End-to-End)

### Prerequisites

Two pieces of prerequisite work must be completed before the core M2 flows work:

1. **M1 Retrofix — GitHub Token Capture**: Update M1's GitHub OAuth sign-in to capture the GitHub access token from Firebase's `OAuthCredential` and send it to the API for encrypted storage. This ensures GitHub-auth users who sign in after the retrofix have a stored token.
2. **Minimal Organization Bootstrap**: On first login (or retroactively for existing users), create a default personal organization and `org_members` entry so that projects have an org to link to.

### Flow A: GitHub-auth user connects a repo (token already stored)

1. User is on the dashboard (authenticated via M1)
2. User clicks "Connect Repository"
3. System checks for a stored GitHub token for this user
4. Token exists and valid → System fetches the user's accessible repositories from GitHub API
5. User sees a list of their GitHub repos (personal + org repos they have access to)
6. User selects a repository
7. System creates a project record linked to the user's default org
8. System registers a webhook on the selected repository for `push` events
9. System fetches the repository file tree (default branch)
10. User is returned to the dashboard showing the new project card
11. User can click into the project to browse the file tree

### Flow B: Email-auth user connects a repo (no GitHub token)

1. User is on the dashboard (authenticated via M1)
2. User clicks "Connect Repository"
3. System checks for a stored GitHub token for this user
4. No token found → System shows "Connect your GitHub account" prompt with explanation
5. User clicks "Connect GitHub"
6. System initiates GitHub OAuth flow (requesting read access to repos)
7. User authorizes MaintainAI on GitHub
8. System receives access token, encrypts and stores it against the user
9. Continues from Flow A, step 4

### Flow C: Token expired or revoked

1. User attempts any GitHub operation (connect repo, browse files, etc.)
2. GitHub API returns 401 (unauthorized)
3. System shows "Your GitHub connection has expired. Please reconnect." with a "Reconnect GitHub" button
4. User clicks "Reconnect GitHub"
5. System initiates GitHub re-authorization (same as Flow B, steps 6–8)
6. On success, system retries the interrupted operation

### Flow D: Browse connected repository

1. User clicks on a project card from the dashboard
2. System loads the project detail page
3. File tree of the default branch is displayed (top-level directories and files)
4. User clicks a folder → contents load (lazy, on demand)
5. User clicks a file → file contents displayed read-only
6. User navigates back via breadcrumbs

### Flow E: Webhook updates file tree

1. User pushes code to a connected repository
2. GitHub sends a `push` webhook to MaintainAI's webhook endpoint
3. System verifies the webhook signature against the stored secret
4. System identifies the affected project by the repository ID
5. System updates the stored file tree for the affected paths
6. Next time user browses the file tree, they see the updated state

---

## 3. Step-by-Step Behaviour

### 3.1 GitHub OAuth Authorization

- System initiates OAuth flow requesting `repo` scope (read access to private and public repos)
- On callback, system receives an access token
- Access token is encrypted before storage
- Token is associated with the user (not a specific project — one token covers all repos)
- If user denies authorization → return to dashboard with message: "GitHub authorization is required to connect repositories."
- If OAuth callback errors → show: "Something went wrong connecting to GitHub. Please try again."

### 3.2 Repository List

- System calls GitHub API to list repos the user has at least read access to
- Results are paginated (GitHub returns max 100 per page)
- Each repo displays: name, owner (user or org), visibility (public/private), primary language, last push date
- User can search/filter the list by name
- Repos already connected by this user are shown as "Connected" and cannot be re-selected
- Empty state (no repos): "No repositories found. Make sure your GitHub account has access to at least one repository."

### 3.3 Default Organization Bootstrap

- When a user's first project is created, the system checks if the user has an org
- If no org exists: create a default personal org (name: user's display name or email prefix, plan: 'free') and an `org_members` entry (role: 'owner')
- This is automatic — no UI or user input required
- Existing users who already have an org from a prior bootstrap are unaffected

### 3.4 Project Creation

On repo selection, the system:

1. Creates a project record:
   - Linked to the user's default org
   - `source_type`: 'github'
   - `source_url`: repository clone URL
   - `name`: repository name
   - `health_status`: 'unknown' (until M4 runs a scan)
   - `is_active`: true
2. Stores the GitHub connection metadata (repo ID, webhook secret, default branch)
3. Registers a GitHub webhook on the repo:
   - Events: `push`
   - URL: MaintainAI's webhook endpoint
   - Secret: randomly generated per-project, stored encrypted
4. Fetches the default branch name from GitHub API (does not assume `main` or `master`)
5. Fetches the top-level file tree of the default branch

If any step fails, the entire operation rolls back — no partial project records.

### 3.5 File Tree Browsing

- File tree is fetched on demand via GitHub API (not a full local clone)
- Top-level loads on project page open; subdirectories load on click
- Each entry shows: name, type (file/folder), size (files only)
- File content view: read-only, with the file's raw content displayed
- File tree always reflects the default branch
- Breadcrumb navigation shows the current path and allows navigating back to any parent

### 3.6 Webhook Processing

- Incoming webhooks are verified by computing HMAC-SHA256 of the payload using the stored webhook secret
- Invalid signatures → reject with 401, log the attempt, no state change
- Valid `push` events:
  - Identify the project by matching the repository ID from the payload
  - Update the stored file tree metadata for affected paths (added, modified, deleted files)
- Events from unknown repositories are ignored (200 response, no processing)
- Events for inactive projects are ignored

### 3.7 Dashboard Project Cards

- Connected projects appear as cards on the dashboard
- Each card shows: repo name, owner, visibility badge (public/private), connection status, health status badge ('unknown' for M2)
- Clicking a card navigates to the project detail page (file browser)
- If no projects exist: dashboard shows empty state with "Connect Repository" CTA (carried over from M1)

---

## 4. Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| User has zero GitHub repos | Show empty state: "No repositories found. Make sure your GitHub account has access to at least one repository." |
| User has hundreds of repos | Paginate the list. Load additional pages on scroll or via "Load more" button. |
| Same repo already connected by this user | Repo appears as "Connected" in the list and cannot be re-selected. |
| User disconnects then reconnects the same repo | Previous project is soft-deleted (`is_active: false`). New connection creates a fresh project record. |
| GitHub API rate limit hit | Show: "GitHub is temporarily unavailable. Please try again in X minutes." Display the reset time from GitHub's `X-RateLimit-Reset` header. |
| Webhook registration fails | Project is still created but flagged as "webhook pending". System retries registration (up to 3 attempts with backoff). User sees a warning on the project card. |
| Very large repo (>10,000 files) | File tree fetched lazily — only the requested directory level loads per interaction. Never fetch the entire tree recursively in one call. |
| User revokes MaintainAI's GitHub access externally | Next GitHub API call returns 401 → trigger Flow C (reconnect prompt). |
| Default branch is not `main` or `master` | System reads the default branch from the GitHub API `default_branch` field. Never hardcode branch names. |
| GitHub-auth user signed in before M1 retrofix (no stored token) | Treated the same as an email user — shown "Connect GitHub" OAuth flow (Flow B). |
| User's GitHub org requires SSO approval for OAuth apps | GitHub returns 403 with SSO message. Show: "Your GitHub organization requires SSO approval for MaintainAI. Please ask your org admin to approve the app." |
| Webhook payload for a deleted repository | Ignore gracefully. Mark project as inactive if repo deletion is confirmed. |

---

## 5. Failure Modes

| Scenario | HTTP Status | User-Facing Message | System Behaviour |
|----------|-----------|---------------------|-----------------|
| GitHub OAuth denied by user | N/A (redirect) | "GitHub authorization is required to connect repositories." | Return to dashboard, no state change |
| GitHub OAuth callback error | 500 | "Something went wrong connecting to GitHub. Please try again." | Log full error, no state change |
| GitHub token expired/revoked | 401 from GitHub | "Your GitHub connection has expired. Please reconnect." | Show reconnect prompt, do not retry silently |
| GitHub API rate limit | 403 from GitHub | "GitHub is temporarily unavailable. Please try again in X minutes." | Display reset time, no state change |
| Repo not found / access revoked | 404 from GitHub | "This repository is no longer accessible. It may have been deleted or your access was revoked." | Mark project as inactive |
| Webhook signature verification failed | 401 | N/A (no user-facing) | Reject payload, log the attempt |
| Database error during project creation | 500 | "Something went wrong. Please try again." | Rollback transaction — no partial records. Log error. |
| GitHub API timeout | Timeout | "GitHub is taking too long to respond. Please try again." | No state change, log timeout |
| Webhook registration failed after 3 retries | N/A | Warning on project card: "Webhook setup pending" | Log failure, project still usable but won't auto-sync |
| GitHub org SSO required | 403 from GitHub | "Your GitHub organization requires SSO approval for MaintainAI." | No state change, show guidance |

---

## 6. Acceptance Criteria

### GitHub OAuth & Token Management

- [ ] Given an authenticated GitHub-auth user with a stored token, when they click "Connect Repository", then they see their list of GitHub repos without a second OAuth prompt.
- [ ] Given an authenticated email-auth user with no stored token, when they click "Connect Repository", then they are prompted to connect their GitHub account via OAuth.
- [ ] Given a GitHub-auth user who signed in before the M1 retrofix (no stored token), when they click "Connect Repository", then they are prompted to connect GitHub via OAuth (same as email user).
- [ ] Given a user with an expired/revoked GitHub token, when they attempt any GitHub operation, then they see a clear "Reconnect GitHub" prompt — not a generic error.
- [ ] Given the stored GitHub access token, it must be encrypted at rest — never stored in plaintext.

### Repository Connection

- [ ] Given a user viewing their repo list, when they select a private repository, then a project record is created and the repo is accessible.
- [ ] Given a user who selects a repo, then a webhook is registered on that repo for push events.
- [ ] Given a user who has already connected a repo, that repo appears as "Connected" in the list and cannot be re-connected.
- [ ] Given a project creation failure mid-way, no partial project records remain in the database.
- [ ] Given the user's first project creation, a default personal org is automatically created if none exists.

### File Tree Browsing

- [ ] Given a connected project, when the user navigates to the project detail page, then they see the file tree of the default branch.
- [ ] Given a file tree, when the user clicks a folder, then its contents load on demand.
- [ ] Given a file tree, when the user clicks a file, then the file contents are displayed read-only.
- [ ] Given a repo whose default branch is not `main` or `master`, the correct default branch is used.

### Webhooks

- [ ] Given a connected project with a registered webhook, when a push event is received with a valid signature, then the file tree metadata is updated.
- [ ] Given a webhook event with an invalid signature, then it is rejected and no state changes occur.
- [ ] Given a webhook event for an unknown or inactive project, then it is ignored gracefully.

### Dashboard

- [ ] Given a user with connected repos, the dashboard shows project cards with repo name, owner, visibility, and connection status.
- [ ] Given a user with no connected repos, the dashboard shows the empty state with a "Connect Repository" call-to-action.

---

## 7. Open Questions / Assumptions

### Open Questions (All Resolved)

1. **GitHub App vs OAuth App**: ~~Should we use a GitHub App or OAuth App?~~ **Decision: OAuth App.** Simpler user-level token, standard OAuth consent. Sufficient for M2 read + future M8 write.

2. **Token storage model**: ~~User-level or per-project?~~ **Decision: User-level.** One encrypted token per user. Simpler, avoids duplication.

3. **Write scope timing**: ~~Upfront or later?~~ **Decision: Request `repo` scope upfront.** Users consent once. No re-authorization needed for M8.

4. **File content rendering**: ~~Syntax highlighted or plain text?~~ **Decision: Plain text for M2.** Syntax highlighting is polish, not core functionality.

### Assumptions

- M1 retrofix (GitHub token capture on sign-in) is completed before M2 implementation begins.
- Default personal org is bootstrapped automatically — no org management UI needed in M2.
- File tree is fetched on demand via GitHub API — no full repository clone or local storage.
- One project per repo per user (same repo cannot be connected twice by the same user).
- The webhook endpoint is publicly accessible (no VPN/IP restrictions for GitHub to reach it).
- All open questions above must be resolved before implementation begins.
