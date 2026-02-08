# coding-patterns.md — Global Coding Patterns Reference

## Purpose

This document is the **single source of truth** for coding patterns used across the codebase. All features must follow these patterns. Before introducing a new pattern, check here first — if one exists for the same concern, use it.

Each feature's `feature.md` should **reference** patterns by name from this doc, not redefine them.

---

## Backend Patterns (NestJS)

### B1: Feature Module Structure

Every feature is a NestJS module containing its own controller, service, and module file.

```
src/<feature>/
├── <feature>.module.ts      # @Module declaration
├── <feature>.controller.ts  # Route handlers
└── <feature>.service.ts     # Business logic
```

- Module declares its own providers and controllers
- Module exports services that other modules need
- Module imports dependencies from other modules

**Used by:** Auth, Users, Health

---

### B2: Global Module (Shared Infrastructure)

Infrastructure modules used by most features are marked `@Global()` so they don't need explicit imports everywhere.

```typescript
@Global()
@Module({ providers: [...], exports: [...] })
```

- Use sparingly — only for truly cross-cutting concerns
- Must export an injection token or service

**Used by:** DatabaseModule (`DRIZZLE` token)

---

### B3: Symbol Injection Token

Custom providers use `Symbol()` tokens to avoid string collisions.

```typescript
// database.constants.ts
export const DRIZZLE = Symbol('DRIZZLE');

// usage in service
constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}
```

**Used by:** DatabaseModule

---

### B4: Guard-Based Auth

Authentication is enforced via a `CanActivate` guard applied per-route with `@UseGuards()`.

```typescript
@Get('me')
@UseGuards(AuthGuard)
getMe(@CurrentUser() user: RequestUser) { ... }
```

- Guard extracts Bearer token from `Authorization` header
- Guard verifies token server-side (Firebase Admin SDK)
- Guard upserts user and attaches DB record to `request.user`
- Guard fails closed — any error returns 401
- `@CurrentUser()` param decorator extracts the user from the request

**Used by:** UsersController

---

### B5: Upsert Pattern (INSERT ... ON CONFLICT)

For records that should be created on first encounter and updated on subsequent encounters.

```typescript
await this.db
  .insert(table)
  .values({ ... })
  .onConflictDoUpdate({
    target: table.uniqueColumn,
    set: { ...updatedFields, updatedAt: sql`now()` },
  })
  .returning();
```

- Always set `updatedAt` in the conflict update
- Always use `.returning()` to get the resulting record

**Used by:** UsersService.upsertFromFirebase

---

### B6: Config Validation

Environment variables are validated at startup via a plain function passed to `@nestjs/config`.

```typescript
ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })
```

- Validation function throws with a clear message listing missing vars
- App refuses to start if required vars are missing

**Used by:** ConfigModule

---

### B7: Circular Module Resolution

When two modules depend on each other, use `forwardRef()` on both sides.

```typescript
// auth.module.ts
@Module({ imports: [forwardRef(() => UsersModule)] })

// users.module.ts
@Module({ imports: [forwardRef(() => AuthModule)] })
```

- Avoid circular deps when possible; use `forwardRef` as a last resort
- Document why the circular dependency exists

**Used by:** AuthModule ↔ UsersModule (guard needs service, controller needs guard)

---

## Frontend Patterns (Next.js)

### F1: Server Component Page → Client Component Body

Page files are server components that render a single `'use client'` component.

```typescript
// app/login/page.tsx (server component)
import { LoginForm } from '@/components/auth/login-form';
export default function LoginPage() {
  return <LoginForm />;
}

// components/auth/login-form.tsx ('use client')
```

- Page file handles metadata and layout concerns
- Client component handles interactivity and state

**Used by:** Login, Signup, Dashboard

---

### F2: Inline Styles (React.CSSProperties)

Styling uses inline `React.CSSProperties` objects. No CSS framework.

```typescript
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '2rem',
};
```

- Define style objects as `const` variables above the JSX
- Use spread for style composition: `{ ...baseStyle, color: 'red' }`

**Used by:** All components (health-status, login-form, signup-form, dashboard-content)

---

### F3: Auth Context Provider

Authentication state is managed via a React context wrapping the entire app.

```typescript
// contexts/auth-context.tsx — provides:
// user (Firebase), dbUser (PostgreSQL), loading, signUp, signIn, signInWithGithub, signOut
```

- `onAuthStateChanged` listener manages auth state
- All auth methods pass the Firebase user to API calls for immediate token availability
- Context is consumed via `useAuth()` hook

**Used by:** Layout, LoginForm, SignupForm, DashboardLayout

---

### F4: Lazy Firebase Initialization

Firebase SDK uses getter functions, not top-level initialization, to avoid SSR/build failures.

```typescript
// lib/firebase.ts
function getFirebaseAuth(): Auth { ... }

// usage — always call the getter, never import a module-level instance
getFirebaseAuth().currentUser
```

- `next build` runs code during static generation where Firebase config env vars aren't available
- Lazy init ensures Firebase only initializes when actually called on the client

**Used by:** api.ts, auth-context.tsx

---

### F5: API Client with Auth Headers

A typed fetch wrapper auto-attaches the Firebase Bearer token.

```typescript
import { get, post } from '@/lib/api';
const user = await get<DbUser>('/users/me', firebaseUser);
```

- Accepts an optional `FirebaseUser` param for immediate token access (avoids race conditions after sign-in)
- Falls back to `getFirebaseAuth().currentUser` if no user passed
- Throws on non-OK responses with the server's error message

**Used by:** AuthContext.fetchDbUser

---

### F6: Firebase Error Mapping

Firebase error codes are mapped to user-friendly strings via a lookup object.

```typescript
import { getFirebaseErrorMessage } from '@/lib/firebase-errors';
// returns: "An account with this email already exists. Try logging in instead."
```

- All Firebase `catch` blocks use this mapping
- Unknown codes fall back to a generic message
- No raw system errors shown to users

**Used by:** LoginForm, SignupForm

---

### F7: Middleware Route Protection (Cookie-Based)

Next.js middleware checks a `__session` cookie for fast redirects.

- Unauthenticated on protected route → redirect to `/login`
- Authenticated on auth route → redirect to `/dashboard`
- **This is a UX hint only, NOT a security boundary** — the real auth check is the backend AuthGuard

**Used by:** middleware.ts

---

## Adding a New Pattern

1. Check this doc — does a pattern already exist for this concern?
2. If yes → use it
3. If no → add it here with:
   - A unique ID (e.g., B8, F8)
   - A clear name
   - A code example
   - "Used by" listing which features use it
4. Update relevant `feature.md` files to reference the new pattern
