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

## Audit Trail

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| 2026-02-08 | M2 implementation | Full feature implementation | Search scoped to user repos (local filter); webhook retry deferred |
