# Feature: Authentication

## Feature Overview

**Name:** Authentication (M1)
**Purpose:** Provides user authentication via Firebase Auth (email/password + GitHub OAuth), stores user records in PostgreSQL, and protects routes behind login.

---

## Key Files

### Backend (`apps/api/`)

| File | Responsibility |
|------|---------------|
| `src/auth/auth.module.ts` | Wires up auth providers, imports UsersModule |
| `src/auth/auth.guard.ts` | `CanActivate` guard — verifies Firebase token, upserts user, attaches to request |
| `src/auth/firebase-admin.service.ts` | Initializes Firebase Admin SDK, exposes `verifyIdToken()` |
| `src/auth/current-user.decorator.ts` | `@CurrentUser()` param decorator — extracts `request.user` |
| `src/auth/auth.interfaces.ts` | TypeScript interfaces for decoded token + request user |
| `src/users/users.module.ts` | Provides UsersService, declares UsersController |
| `src/users/users.service.ts` | `upsertFromFirebase()`, `findByFirebaseUid()`, `findById()`, `storeGithubToken()`, `getGithubToken()`, `hasGithubToken()` |
| `src/users/users.controller.ts` | `GET /users/me`, `POST /users/me/github-token`, `GET /users/me/github-status` |
| `src/users/dto/store-github-token.dto.ts` | DTO for GitHub token storage (M2 retrofix) |
| `src/database/schema/users.ts` | Drizzle table definition for `users` |

### Frontend (`apps/web/`)

| File | Responsibility |
|------|---------------|
| `src/lib/firebase.ts` | Firebase client SDK initialization (lazy, HMR-safe) |
| `src/lib/api.ts` | Fetch wrapper with auto-attached Bearer token |
| `src/lib/firebase-errors.ts` | Maps Firebase error codes to user-friendly messages |
| `src/contexts/auth-context.tsx` | Auth context provider — `onAuthStateChanged` listener, sign up/in/out methods. M2: captures GitHub OAuth token via `GithubAuthProvider.credentialFromResult()` and POSTs to `/users/me/github-token`. |
| `src/middleware.ts` | Route protection via `__session` cookie (UX hint, not security boundary) |
| `src/app/login/page.tsx` | Login page (server component shell) |
| `src/app/signup/page.tsx` | Signup page (server component shell) |
| `src/components/auth/login-form.tsx` | Login form — email/password + GitHub OAuth |
| `src/components/auth/signup-form.tsx` | Signup form — email/password/name + GitHub OAuth |
| `src/app/dashboard/layout.tsx` | Authenticated dashboard shell (header + sign out) |
| `src/app/dashboard/page.tsx` | Dashboard page (empty state) |
| `src/components/dashboard/dashboard-content.tsx` | Empty state content |

---

## Data Models

### `users` table

| Column | Type | Constraints |
|--------|------|------------|
| `id` | UUID | PK, `gen_random_uuid()` |
| `firebase_uid` | VARCHAR(128) | UNIQUE, NOT NULL |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL |
| `display_name` | VARCHAR(255) | Nullable |
| `avatar_url` | TEXT | Nullable |
| `auth_provider` | ENUM('email','github') | NOT NULL, DEFAULT 'email' |
| `email_verified` | BOOLEAN | NOT NULL, DEFAULT false |
| `last_login_at` | TIMESTAMPTZ | Nullable |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**Ownership:** User owns their own record. No cross-user access.
**Lifecycle:** Created on first login (upsert). Updated on every subsequent login.

---

## API Contracts & Payloads

### GET /users/me

**Auth:** Required (Bearer token)

**Request:**
```
GET /users/me
Authorization: Bearer <firebase_id_token>
```

No request body.

**Response (200):**
```json
{
  "id": "uuid",
  "firebaseUid": "string",
  "email": "string",
  "displayName": "string | null",
  "avatarUrl": "string | null",
  "authProvider": "email | github",
  "emailVerified": "boolean",
  "lastLoginAt": "ISO 8601 timestamp | null",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp"
}
```

**Response (401):**
```json
{
  "message": "Invalid or expired token",
  "error": "Unauthorized",
  "statusCode": 401
}
```

---

## Sequence Diagram

### Sign Up / Log In (Email or GitHub)

```
User → Browser: fills form / clicks OAuth button
Browser → Firebase Auth: createUser / signIn / signInWithPopup
Firebase Auth → Browser: credential (ID token)
Browser → API: GET /users/me (Authorization: Bearer <token>)
API → Firebase Admin: verifyIdToken(token)
Firebase Admin → API: decoded token (uid, email, provider)
API → PostgreSQL: INSERT ... ON CONFLICT DO UPDATE (users)
PostgreSQL → API: user record
API → Browser: 200 user JSON
Browser → Browser: store in AuthContext, set __session cookie
Browser → User: redirect to /dashboard
```

### Sign Out

```
User → Browser: clicks "Sign out"
Browser → Firebase Auth: signOut()
Browser → Browser: clear AuthContext, remove __session cookie
Browser → User: redirect to /login
```

### Route Protection (Middleware)

```
User → Browser: navigates to /dashboard
Browser → Next.js Middleware: check __session cookie
Middleware [no cookie] → Browser: redirect to /login
Middleware [has cookie] → Browser: allow, render page
```

---

## Visual Flow

```
[/ Landing] ──→ [/signup] ──→ [Firebase Auth] ──→ [/dashboard]
                   │                                    │
                   ↓                                    ↓
              [/login] ──→ [Firebase Auth] ──→ [/dashboard]
                                                        │
                                                   [Sign Out]
                                                        │
                                                        ↓
                                                   [/login]

Protected routes: /dashboard/*
Auth routes:      /login, /signup
Public routes:    /
```

---

## Inputs & Outputs

### Sign Up (Email/Password)

| Input | Required | Validation |
|-------|----------|-----------|
| Display name | Yes | Non-empty (browser native) |
| Email | Yes | Valid email format (browser native + Firebase) |
| Password | Yes | Min 6 characters (Firebase enforced) |

**Output (success):** User created in Firebase + PostgreSQL, redirected to `/dashboard`
**Output (failure):** User-friendly error message displayed inline

### Log In (Email/Password)

| Input | Required | Validation |
|-------|----------|-----------|
| Email | Yes | Valid email format (browser native) |
| Password | Yes | Non-empty (browser native) |

**Output (success):** User authenticated, `last_login_at` updated, redirected to `/dashboard`
**Output (failure):** User-friendly error message displayed inline

### GitHub OAuth

No user inputs — OAuth flow handled by popup.
M2 enhancement: `provider.addScope('repo')` requests repo access. OAuth credential's access token is captured and stored via `POST /users/me/github-token`.

**Output (success):** User created/updated in Firebase + PostgreSQL, GitHub token encrypted and stored, redirected to `/dashboard`
**Output (failure):** User-friendly error message displayed inline. Token storage failure is non-fatal (user can reconnect later).

---

## State & Ownership

- **Source of truth (auth state):** Firebase Auth SDK on client
- **Source of truth (user data):** PostgreSQL `users` table
- **Cached on client:** `AuthContext` holds `user` (Firebase) and `dbUser` (PostgreSQL record)
- **Session cookie:** `__session` — UX hint for middleware redirects, NOT a security boundary

---

## Security Notes

- Firebase ID tokens verified server-side on every request via `AuthGuard`
- Guard fails closed — any verification error returns 401
- `auth_provider` derived server-side from `decoded.firebase.sign_in_provider`
- Email comes from verified Firebase token, never client input
- `/users/me` returns only the requesting user's data (identity-scoped)
- Middleware cookie is for UX redirects only — backend `AuthGuard` is the real auth boundary
- No secrets in client bundle — Firebase client config is designed to be public

---

## Dependencies

- **Firebase Auth** (client SDK on web, Admin SDK on API)
- **PostgreSQL** (via Docker Compose)
- **Drizzle ORM** (database access)
- **`@nestjs/config`** (environment variable management)

---

## Coding Patterns Used

See `docs/playbook/coding-patterns.md` for full definitions.

- **B1** — Feature Module Structure (Auth, Users)
- **B2** — Global Module (DatabaseModule)
- **B3** — Symbol Injection Token (DRIZZLE)
- **B4** — Guard-Based Auth (AuthGuard + @CurrentUser)
- **B5** — Upsert Pattern (UsersService.upsertFromFirebase)
- **B6** — Config Validation (env.validation.ts)
- **B7** — Circular Module Resolution (AuthModule ↔ UsersModule)
- **F1** — Server Component Page → Client Component Body
- **F2** — Inline Styles
- **F3** — Auth Context Provider
- **F4** — Lazy Firebase Initialization
- **F5** — API Client with Auth Headers
- **F6** — Firebase Error Mapping
- **F7** — Middleware Route Protection

---

## Known Tradeoffs / Debt

1. **No email verification enforcement** — `emailVerified` is synced but not gated
2. **No password reset flow** — Firebase supports it; can be wired up later
3. **No server-side rate limiting** — Firebase has built-in brute-force protection; `@nestjs/throttler` deferred
4. **Orgs/multi-tenancy** — M2 adds organizations and org_members tables for project ownership
5. **Cookie-based middleware is UX only** — NOT a security boundary; backend AuthGuard is real auth
6. **No refresh token rotation** — Firebase SDK handles token refresh automatically
7. **GitHub private email fallback** — uses `{uid}@noreply.github.com` when email unavailable

See `backlog.md` for the full deferred items list.
