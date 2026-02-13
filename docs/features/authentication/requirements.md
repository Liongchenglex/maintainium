# Authentication — Requirements

---

## 1. Context & Intent

### Who is this for?
End users of Maintanium who need to create an account and access the platform.

### Why does it matter?
Authentication is the foundation of the platform. No feature can be built securely without knowing who the user is. M1 establishes the auth pattern that all future features depend on.

### What is explicitly NOT included?
- Password reset flow (Firebase supports it; deferred)
- Email verification enforcement (synced but not gated)
- Role-based access control / permissions
- Organizations / multi-tenancy
- Server-side rate limiting (Firebase has built-in brute-force protection)
- Social providers beyond GitHub (Google, Apple, etc.)

---

## 2. Actual Flow (End-to-End)

### Sign Up (Email/Password)
1. User navigates to `/signup`
2. User enters display name, email, and password
3. User clicks "Sign up"
4. Frontend calls Firebase `createUserWithEmailAndPassword()`
5. Firebase creates the user and returns a credential
6. Frontend updates the user's display name via `updateProfile()`
7. Frontend calls `GET /users/me` with the Firebase ID token
8. Backend AuthGuard verifies the token via Firebase Admin SDK
9. Backend upserts a user record in PostgreSQL
10. Backend returns the user record
11. Frontend stores the user in AuthContext and sets `__session` cookie
12. Frontend redirects to `/dashboard`

### Sign Up (GitHub OAuth)
1. User navigates to `/signup`
2. User clicks "Sign up with GitHub"
3. Frontend opens GitHub OAuth popup via Firebase `signInWithPopup()`
4. User authorizes the app on GitHub
5. GitHub redirects back to Firebase, which creates/links the user
6. Firebase returns a credential
7. Frontend calls `GET /users/me` with the Firebase ID token
8. Backend AuthGuard verifies the token via Firebase Admin SDK
9. Backend upserts a user record in PostgreSQL (email falls back to `{uid}@noreply.github.com` if GitHub email is private)
10. Backend returns the user record
11. Frontend stores the user in AuthContext and sets `__session` cookie
12. Frontend redirects to `/dashboard`

### Log In (Email/Password)
1. User navigates to `/login`
2. User enters email and password
3. User clicks "Log in"
4. Frontend calls Firebase `signInWithEmailAndPassword()`
5. Firebase verifies credentials and returns a credential
6. Frontend calls `GET /users/me` with the Firebase ID token
7. Backend AuthGuard verifies the token, upserts user (updates `last_login_at`)
8. Backend returns the user record
9. Frontend stores the user in AuthContext and sets `__session` cookie
10. Frontend redirects to `/dashboard`

### Log In (GitHub OAuth)
Same as Sign Up (GitHub OAuth) — Firebase handles create-or-link automatically.

### Sign Out
1. User clicks "Sign out" on the dashboard header
2. Frontend calls Firebase `signOut()`
3. Frontend clears `dbUser` from AuthContext and removes `__session` cookie
4. Frontend redirects to `/login`

### Route Protection
1. User visits a protected route (e.g., `/dashboard`) without being authenticated
2. Next.js middleware checks for `__session` cookie
3. Cookie missing → redirect to `/login`
4. User visits an auth route (e.g., `/login`) while authenticated
5. Middleware checks for `__session` cookie
6. Cookie present → redirect to `/dashboard`

---

## 3. Step-by-Step Behaviour (Deterministic)

### AuthGuard (Backend)
- If `Authorization` header is missing or doesn't start with `Bearer ` → 401
- If token verification fails (expired, malformed, wrong project) → 401
- If token is valid but user upsert fails (DB error) → 401
- If token is valid and upsert succeeds → attach user to request, allow

### Sign Up Form (Frontend)
- If email is empty → browser native validation prevents submit
- If password is empty → browser native validation prevents submit
- If display name is empty → browser native validation prevents submit
- If password < 6 characters → Firebase rejects with `auth/weak-password`
- If email already registered → Firebase rejects with `auth/email-already-in-use`
- If Firebase returns any error → display user-friendly message from error map
- If Firebase succeeds but backend `/users/me` fails → user is created in Firebase but not in DB; next login attempt will retry the upsert

### Login Form (Frontend)
- If email is empty → browser native validation prevents submit
- If password is empty → browser native validation prevents submit
- If credentials are wrong → Firebase rejects with `auth/invalid-credential`
- If account is disabled → Firebase rejects with `auth/user-disabled`
- If too many attempts → Firebase rejects with `auth/too-many-requests`

### GitHub OAuth (Frontend)
- If user closes popup → Firebase rejects with `auth/popup-closed-by-user`
- If account exists with different provider → Firebase rejects with `auth/account-exists-with-different-credential`

### Middleware
- Cookie `__session` present + visiting `/login` or `/signup` → redirect to `/dashboard`
- Cookie `__session` absent + visiting `/dashboard` or sub-routes → redirect to `/login`
- Cookie `__session` absent + visiting `/` or `/login` or `/signup` → allow
- Cookie `__session` present + visiting `/` → allow (landing page is always accessible)

---

## 4. Edge Cases

| Scenario | Expected Behaviour |
|----------|-------------------|
| User signs up with email, then tries GitHub with same email | Firebase may link accounts or reject depending on config; error displayed via error map |
| User signs up with GitHub but has private email | Fallback email `{uid}@noreply.github.com` used in DB |
| User submits sign-up form twice rapidly | Firebase rejects the second attempt; button is disabled during loading |
| Token expires mid-session | Firebase SDK auto-refreshes; if refresh fails, next API call returns 401 |
| User has `__session` cookie but Firebase session expired | Middleware allows access (cookie is UX hint); backend returns 401 on API call; `onAuthStateChanged` fires with null and clears state |
| DB is down during login | AuthGuard catches upsert error, returns 401; user cannot proceed |
| Multiple browser tabs signed in | `onAuthStateChanged` fires in all tabs; all tabs share Firebase auth state |
| User signs out in one tab | `onAuthStateChanged` fires in other tabs; auth state clears everywhere |

---

## 5. Failure Modes

| Failure | HTTP Status | User-Facing Message | System Behaviour |
|---------|-------------|---------------------|-----------------|
| Missing/invalid auth header | 401 | N/A (API only) | Guard rejects immediately |
| Expired/invalid Firebase token | 401 | N/A (API only) | Guard rejects after verification |
| Wrong email/password | N/A (Firebase) | "Invalid email or password. Please check your credentials and try again." | Firebase returns `auth/invalid-credential` |
| Email already in use | N/A (Firebase) | "An account with this email already exists. Try logging in instead." | Firebase returns `auth/email-already-in-use` |
| Weak password | N/A (Firebase) | "Password must be at least 6 characters." | Firebase returns `auth/weak-password` |
| Too many attempts | N/A (Firebase) | "Too many failed attempts. Please wait a moment and try again." | Firebase returns `auth/too-many-requests` |
| GitHub popup closed | N/A (Firebase) | "Sign-in popup was closed. Please try again." | Firebase returns `auth/popup-closed-by-user` |
| Network failure | N/A (Firebase) | "Network error. Please check your connection and try again." | Firebase returns `auth/network-request-failed` |
| Database unavailable | 401 | N/A (API only) | Upsert fails; guard catches and returns 401 |
| Unknown error | N/A | "Something went wrong. Please try again." | Catch-all fallback |

---

## 6. Acceptance Criteria

- [ ] Given a new user, when they sign up with email/password, then a user record is created in PostgreSQL and they are redirected to `/dashboard`
- [ ] Given a new user, when they sign up with GitHub, then a user record is created in PostgreSQL and they are redirected to `/dashboard`
- [ ] Given an existing user, when they log in with email/password, then `last_login_at` is updated and they are redirected to `/dashboard`
- [ ] Given an existing user, when they log in with GitHub, then `last_login_at` is updated and they are redirected to `/dashboard`
- [ ] Given a valid Bearer token, when `GET /users/me` is called, then the authenticated user's record is returned
- [ ] Given no token, when `GET /users/me` is called, then a 401 response is returned
- [ ] Given an expired token, when `GET /users/me` is called, then a 401 response is returned
- [ ] Given an unauthenticated user, when they visit `/dashboard`, then they are redirected to `/login`
- [ ] Given an authenticated user, when they visit `/login`, then they are redirected to `/dashboard`
- [ ] Given an authenticated user, when they click "Sign out", then they are redirected to `/login` and cannot access `/dashboard`
- [ ] Given wrong credentials, when a user tries to log in, then a user-friendly error message is displayed
- [ ] Given any async action (sign up, log in, GitHub), when the action is in progress, then the button is disabled and shows loading text
- [ ] Given a GitHub user with a private email, when they sign up, then a fallback email is stored and the user is created successfully

---

## 7. Open Questions / Assumptions

All resolved.

| Question | Resolution |
|----------|-----------|
| Which auth provider? | Firebase Auth (confirmed) |
| Which OAuth providers for M1? | Email/password + GitHub only |
| Store password hash locally? | No — Firebase manages credentials |
| Enforce email verification? | No — synced but not gated (M1 tradeoff) |
| Multi-tenancy? | Deferred — flat user model for M1 |
| Rate limiting? | Deferred — Firebase has built-in brute-force protection |
| What if GitHub doesn't provide email? | Fallback to `{uid}@noreply.github.com` |
