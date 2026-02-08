# Authentication — Backlog

Items identified during M1 implementation and security review that are deferred to future milestones.

---

## Security Hardening

### Server-Side Rate Limiting
- **Risk:** No rate limiting on `/users/me` or future authenticated endpoints
- **Mitigation (current):** Firebase Auth has built-in brute-force protection on sign-in attempts; token verification adds latency cost that somewhat limits abuse
- **Action:** Add `@nestjs/throttler` to protected endpoints
- **Priority:** High — should be addressed in M2

### Email Verification Enforcement
- **Risk:** `emailVerified` is synced from Firebase but not gated — unverified email users can access the full app
- **Mitigation (current):** Firebase manages email verification; the flag is stored but not enforced
- **Action:** Gate sensitive actions behind `emailVerified === true`; add verification prompt UI
- **Priority:** Medium

---

## Auth Features

### Password Reset Flow
- **Status:** Firebase supports password reset out of the box
- **Action:** Add "Forgot password?" link on login page, wire up `sendPasswordResetEmail()`
- **Priority:** Medium

### Session Revocation
- **Status:** Firebase tokens auto-expire (1 hour) and refresh automatically; no manual revocation
- **Action:** Add `revokeRefreshTokens()` via Firebase Admin for forced sign-out (e.g., password change, account compromise)
- **Priority:** Low — acceptable for M1 given auto-expiry

### Refresh Token Rotation
- **Status:** Firebase SDK handles token refresh automatically
- **Action:** No immediate action needed; monitor for Firebase SDK updates
- **Priority:** Low

---

## Data Model

### Orgs / Multi-Tenancy
- **Status:** Flat user model (no orgs, no roles)
- **Action:** Add `orgs` and `org_members` tables when multi-tenancy is needed
- **Priority:** Deferred to future milestone

### GitHub Users Without Public Email
- **Status:** GitHub OAuth users with private emails get a fallback email (`{uid}@noreply.github.com`)
- **Action:** Consider prompting users to add an email, or fetching email via GitHub API with `user:email` scope
- **Priority:** Low

---

## Infrastructure

### HTTPS in Development
- **Status:** Localhost uses HTTP (standard for local dev)
- **Action:** Enforce HTTPS in staging/production via reverse proxy or platform config
- **Priority:** Required before any non-local deployment

---

## Audit Trail

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| 2026-02-08 | M1 implementation | Full security playbook review | All items pass; rate limiting flagged as deferred |
