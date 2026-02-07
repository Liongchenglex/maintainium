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
| `src/users/users.service.ts` | `upsertFromFirebase()`, `findByFirebaseUid()`, `findById()` |
| `src/users/users.controller.ts` | `GET /users/me` — returns authenticated user's record |
| `src/database/schema/users.ts` | Drizzle table definition for `users` |

### Frontend (`apps/web/`)

| File | Responsibility |
|------|---------------|
| `src/lib/firebase.ts` | Firebase client SDK initialization (lazy, HMR-safe) |
| `src/lib/api.ts` | Fetch wrapper with auto-attached Bearer token |
| `src/lib/firebase-errors.ts` | Maps Firebase error codes to user-friendly messages |
| `src/contexts/auth-context.tsx` | Auth context provider — `onAuthStateChanged` listener, sign up/in/out methods |
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

## APIs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users/me` | Required (Bearer token) | Returns the authenticated user's DB record |

---

## State & Ownership

- **Source of truth (auth state):** Firebase Auth SDK on client
- **Source of truth (user data):** PostgreSQL `users` table
- **Client-side cache:** `AuthContext` holds `user` (Firebase) and `dbUser` (PostgreSQL record)
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

- **NestJS Guard pattern** — `CanActivate` for auth checks
- **Custom param decorator** — `@CurrentUser()` for clean controller signatures
- **Global module pattern** — `DatabaseModule` is `@Global()`, exports `DRIZZLE` token
- **Upsert pattern** — `INSERT ... ON CONFLICT DO UPDATE` for user creation/update
- **Lazy initialization** — Firebase client SDK uses getter functions to avoid SSR/build issues
- **Inline styles** — Consistent with existing `health-status.tsx` pattern (no CSS framework)
- **Server/client component split** — Page files are server components that render client form components

---

## Known Tradeoffs / Debt

1. **No email verification enforcement** — `emailVerified` is synced but not gated
2. **No password reset flow** — Firebase supports it; can be wired up later
3. **No server-side rate limiting** — Firebase has built-in brute-force protection; `@nestjs/throttler` deferred
4. **No orgs/multi-tenancy** — flat user model for M1; orgs deferred to future milestone
5. **Cookie-based middleware is UX only** — NOT a security boundary; backend AuthGuard is real auth
6. **No refresh token rotation** — Firebase SDK handles token refresh automatically
