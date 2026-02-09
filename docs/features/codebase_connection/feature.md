# Codebase Connection Feature

## Feature
Name: GitHub Codebase Connection
Purpose: Allow users to connect GitHub repositories to MaintainAI, browse file trees, and receive webhook updates on push events.

---

## Key Files

Frontend:
- `apps/web/src/app/dashboard/connect/page.tsx` — Connect repo page (server shell)
- `apps/web/src/app/dashboard/projects/[id]/page.tsx` — Project detail page (server shell)
- `apps/web/src/components/projects/connect-repo.tsx` — Repo selection UI
- `apps/web/src/components/projects/repo-list-item.tsx` — Single repo row
- `apps/web/src/components/projects/project-detail.tsx` — Project detail + file browser
- `apps/web/src/components/projects/file-tree.tsx` — Directory listing
- `apps/web/src/components/projects/file-viewer.tsx` — File content viewer
- `apps/web/src/components/projects/breadcrumb-nav.tsx` — Path breadcrumbs
- `apps/web/src/components/projects/github-reconnect-prompt.tsx` — Reconnect UI
- `apps/web/src/components/dashboard/dashboard-content.tsx` — Dashboard with project cards
- `apps/web/src/components/dashboard/project-card.tsx` — Project card component
- `apps/web/src/contexts/auth-context.tsx` — Modified: captures GitHub OAuth token
- `apps/web/src/lib/github-errors.ts` — GitHub error code mapping
- `apps/web/src/lib/api.ts` — API client (unchanged)

Backend:
- `apps/api/src/github/github.module.ts` — GitHub module
- `apps/api/src/github/github.controller.ts` — OAuth endpoints
- `apps/api/src/github/github.service.ts` — GitHub REST API client
- `apps/api/src/github/github-oauth.service.ts` — OAuth flow (state, code exchange)
- `apps/api/src/github/github.interfaces.ts` — GitHub API types
- `apps/api/src/github/github.errors.ts` — Custom error classes
- `apps/api/src/github/github.exception-filter.ts` — Maps GitHub errors to HTTP responses
- `apps/api/src/organizations/organizations.module.ts` — Org module
- `apps/api/src/organizations/organizations.service.ts` — Org CRUD + default org bootstrap
- `apps/api/src/projects/projects.module.ts` — Projects module
- `apps/api/src/projects/projects.controller.ts` — Project CRUD + tree/file endpoints
- `apps/api/src/projects/projects.service.ts` — Project business logic
- `apps/api/src/projects/dto/create-project.dto.ts` — Create project DTO
- `apps/api/src/webhooks/webhooks.module.ts` — Webhooks module
- `apps/api/src/webhooks/webhooks.controller.ts` — GitHub webhook receiver
- `apps/api/src/webhooks/webhooks.service.ts` — HMAC verification + event processing
- `apps/api/src/common/encryption.service.ts` — AES-256-GCM encryption
- `apps/api/src/common/common.module.ts` — Global common module
- `apps/api/src/users/users.service.ts` — Modified: GitHub token CRUD
- `apps/api/src/users/users.controller.ts` — Modified: token store + status endpoints
- `apps/api/src/users/dto/store-github-token.dto.ts` — Token store DTO

Schema:
- `apps/api/src/database/schema/organizations.ts`
- `apps/api/src/database/schema/org-members.ts`
- `apps/api/src/database/schema/projects.ts`
- `apps/api/src/database/schema/github-tokens.ts`

---

## Data Models

- `organizations` — User workspaces (auto-created on first project)
- `org_members` — Maps users to orgs with roles
- `projects` — Connected repositories with GitHub metadata
- `github_tokens` — Encrypted GitHub access tokens per user

---

## API Contracts & Payloads

### GitHub OAuth
```
GET /github/oauth/initiate (AuthGuard)
→ 302 Redirect to GitHub OAuth

GET /github/oauth/callback?code=...&state=...
→ 302 Redirect to /dashboard/connect?github=connected
```

### GitHub Token (M1 Retrofix)
```
POST /users/me/github-token (AuthGuard)
Request: { "accessToken": "gho_..." }
Response: { "success": true }

GET /users/me/github-status (AuthGuard)
Response: { "connected": true, "githubUsername": "octocat" }
```

### Repository Browsing
```
GET /projects/repos?page=1&per_page=30&search=query (AuthGuard)
Response: [{ id, name, fullName, owner, private, description, language, connected, ... }]
```

### Project CRUD
```
POST /projects (AuthGuard)
Request: { "githubRepoId": 12345, "owner": "octocat", "repo": "hello-world" }
Response: { id, name, slug, githubOwner, ... }

GET /projects (AuthGuard)
Response: [{ id, name, visibility, healthStatus, webhookId, updatedAt, ... }]

GET /projects/:id (AuthGuard)
Response: { id, name, githubOwner, githubRepoName, visibility, ... }
```

### File Tree
```
GET /projects/:id/tree?path=src (AuthGuard)
Response: [{ name, type: "directory"|"file", sha, size }]

GET /projects/:id/file?path=README.md (AuthGuard)
Response: { name, path, size, content, truncated, binary }
```

### Webhooks
```
POST /webhooks/github (no auth — HMAC verified)
Headers: x-hub-signature-256, x-github-event
Response: { "received": true }
```

---

## Sequence Diagram

### GitHub Sign-In (repo scope token capture)
```
User → UI: Click "Sign in with GitHub"
UI → Firebase: signInWithPopup (GithubAuthProvider, scope: repo)
Firebase → GitHub: OAuth flow
GitHub → Firebase: OAuth credential
Firebase → UI: UserCredential (includes OAuthCredential.accessToken)
UI → API: POST /users/me/github-token { accessToken }
API → DB: Encrypt + upsert github_tokens
```

### Email User GitHub OAuth
```
User → UI: Click "Connect GitHub"
UI → API: GET /github/oauth/initiate (redirects)
API → GitHub: OAuth authorize URL (with encrypted state)
GitHub → User: Authorization prompt
User → GitHub: Approve
GitHub → API: GET /github/oauth/callback?code=...&state=...
API → GitHub: Exchange code for token
API → DB: Encrypt + store token
API → UI: Redirect to /dashboard/connect?github=connected
```

### Connect Repository
```
User → UI: Select repo from list
UI → API: POST /projects { githubRepoId, owner, repo }
API → GitHub: GET /repos/:owner/:repo (validate access)
API → DB: ensureDefaultOrg → insert project
API → GitHub: POST /repos/:owner/:repo/hooks (register webhook)
API → DB: Update project with webhookId
API → UI: Project created
UI → Router: Navigate to /dashboard
```

### File Browsing
```
User → UI: Click project card
UI → API: GET /projects/:id
UI → API: GET /projects/:id/tree
API → GitHub: GET /repos/:owner/:repo/git/trees/:sha
API → UI: Sorted directory entries
User → UI: Click file
UI → API: GET /projects/:id/file?path=...
API → GitHub: GET /repos/:owner/:repo/contents/:path
API → UI: Decoded file content
```

---

## Visual Flow

```
[Dashboard (empty)] → [Connect Page] → [GitHub OAuth / Repo List] → [Select Repo] → [Dashboard (cards)]
[Dashboard (cards)] → [Project Detail] → [File Tree] → [File Viewer]
```

---

## Inputs & Outputs

### Inputs
- GitHub OAuth code + state (OAuth callback)
- GitHub access token (Firebase sign-in)
- Repository selection (githubRepoId, owner, repo)
- File path for tree/content browsing

### Outputs
- Encrypted GitHub token stored in DB
- Project record with GitHub metadata
- Webhook registered on GitHub repo
- File tree (directory listing)
- File content (plain text, truncated if >1MB)

---

## State & Ownership

Source of truth: PostgreSQL (projects, github_tokens tables)
Cached on client: React component state (repos, projects, file tree)
GitHub data: Fetched on demand from GitHub API (not cached server-side)

---

## Security

Auth required: All endpoints except webhook receiver
Ownership enforced on: Project access (user must be org member)
Tokens: Encrypted at rest with AES-256-GCM
Webhook verification: HMAC-SHA256 with timing-safe comparison
OAuth state: Encrypted, expires after 10 minutes

---

## Dependencies

- External services: GitHub API (REST v3), Firebase Auth
- Shared utilities: EncryptionService (CommonModule), AuthGuard
- Patterns: B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, F1, F2, F3, F4, F5, F8

---

## Deferred / Out of Scope

- Webhook registration retry with backoff (project created with null webhookId)
- Full disconnect/reconnect flow (soft-delete only)
- Server-side API rate limiting
- GitHub token refresh (OAuth tokens don't expire, only revocable)
- Syntax highlighting in file viewer (plain text only)
- Caching of GitHub API responses
