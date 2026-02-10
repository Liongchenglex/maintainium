# Codebase Connection — Backlog

Items identified during M2 implementation that are deferred to future milestones.

---

## Search & Filtering

### Repository Search Optimization
- **Current:** Search filters the current page of `/user/repos` results locally (server-side string match). Only works within the fetched page (default 30 repos).
- **Limitation:** Users with hundreds of repos may not find results that aren't on the current page.
- **Action:** Fetch all user repos across multiple pages and filter, or use GitHub's `/search/repositories` API with `user:<username>` qualifier to scope to the authenticated user's repos.
- **Priority:** Medium — acceptable for users with <100 repos

---

## Webhook Reliability

### Webhook End-to-End Testing
- **Current:** Webhook HMAC verification and event processing are implemented but untested with real GitHub webhook deliveries. Local development requires a tunnel (e.g., ngrok) to receive webhooks, which adds unnecessary complexity.
- **Action:** Test after hosting the API on a public server. Steps: (1) set `WEBHOOK_BASE_URL` to the production/staging domain, (2) re-create a project to trigger automatic webhook registration, (3) push to the connected repo and verify `project.updatedAt` updates, (4) remove debug logging from `webhooks.service.ts` once verified.
- **Priority:** High — test after first deployment to hosting, not blocked by any milestone
- **Note:** Do NOT defer to post-MVP. Test as soon as the API is hosted on a public URL (staging or production). Webhook registration and verification are core to the feature and should be validated early.

### Webhook Registration Retry
- **Current:** If webhook registration fails during project creation, the project is created with `webhookId: null`. No automatic retry.
- **Action:** Add retry with exponential backoff (up to 3 attempts). Show "Webhook setup pending" on the project card.
- **Priority:** Medium

### Webhook Payload for Deleted Repos
- **Current:** Ignored gracefully. No project state change.
- **Action:** Mark project as inactive if repo deletion is confirmed via GitHub API.
- **Priority:** Low

---

## Token Management

### Disconnect / Reconnect Flow
- **Current:** No UI to disconnect a GitHub account or remove a stored token.
- **Action:** Add "Disconnect GitHub" option in settings. Soft-delete token, mark projects as inactive.
- **Priority:** Medium

### GitHub Token Scope Upgrade
- **Current:** `repo` scope requested upfront (read + write). Write not used until M8.
- **Action:** Consider requesting read-only scope initially and upgrading when write is needed.
- **Priority:** Low — current approach avoids re-authorization later

---

## File Browsing

### Syntax Highlighting
- **Current:** File content rendered as plain text in `<pre>` tags.
- **Action:** Add syntax highlighting (e.g., Prism.js or highlight.js) based on file extension.
- **Priority:** Low — cosmetic improvement

### File Content Caching
- **Current:** File tree and file content fetched live from GitHub API on every request. No caching.
- **Action:** Add server-side cache with short TTL (e.g., 5 minutes) to reduce GitHub API calls and improve latency.
- **Priority:** Medium — improves UX for repeated browsing

---

## Security

### Server-Side API Rate Limiting
- **Current:** No rate limiting on project/GitHub proxy endpoints.
- **Action:** Add `@nestjs/throttler` to prevent abuse of GitHub API proxy endpoints.
- **Priority:** High — should be addressed before production

---

## Sync & Staleness

### Default Branch Change Detection
- **Current:** The default branch is captured once at project creation and stored in `projects.github_default_branch`. It is never updated afterward. If the user changes the default branch on GitHub (e.g., `main` → `develop`), file tree browsing breaks (GitHub API returns ref not found) and the project detail header shows the stale branch name.
- **Action:** Sync the default branch on push webhook events by fetching the repo's current default branch from the GitHub API. Alternatively, listen for the `repository` webhook event (fired on settings changes including default branch).
- **Impact:** `webhooks.service.ts` (add branch sync on push/repository events), `github.service.ts` (fetch repo details), `projects.service.ts` (update stored branch).
- **Priority:** Medium — changing the default branch is rare, but when it happens it fully breaks file browsing for the project.

---

## Architecture Evolution

### Migrate from GitHub OAuth App to GitHub App
- **Current:** Using a GitHub OAuth App with user-level `repo` scope tokens. Tokens are long-lived (don't expire unless revoked). Webhooks are registered manually via GitHub API during project creation.
- **Benefit:** GitHub Apps provide fine-grained per-repo permissions, automatic webhook management (configured in app settings, not via API), organization-level installation, and short-lived auto-refreshing tokens (no risk of stale long-lived tokens). This is the standard approach used by production apps (Semgrep, Codecov, Dependabot, etc.).
- **Action:** Create a GitHub App, implement JWT signing for installation token generation, add token refresh logic, migrate webhook management to app-level config, update OAuth flow to GitHub App installation flow.
- **Impact:** Touches GitHub module (OAuth → App install flow), webhook module (HMAC stays, but registration moves to app config), projects module (token refresh), frontend (install flow UI).
- **Priority:** Medium — current OAuth App approach works fine for MVP. Consider for post-MVP when fine-grained permissions or org-level features are needed.

### CMS Connection
- **Current:** Only GitHub is supported as a source type for project connections.
- **Action:** Add support for CMS platforms (e.g., Contentful, Strapi, Sanity, WordPress) as additional source types. This would involve: (1) new `sourceType` enum values in the projects schema, (2) a CMS module with platform-specific API clients, (3) OAuth/API key flows for each CMS platform, (4) content browsing UI adapted for CMS content models (entries, assets, content types) instead of file trees, (5) webhook/polling for content change detection.
- **Impact:** New feature module. Requires extending the projects schema, adding a CMS module parallel to the GitHub module, and new frontend pages for CMS connection + content browsing.
- **Priority:** Low — future milestone. Design decisions needed: which CMS platforms to support first, whether to use a unified content abstraction or platform-specific UIs.

---

## Audit Trail

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| 2026-02-08 | M2 implementation | Full feature implementation | Search scoped to user repos (local filter); webhook retry deferred |
