# MaintainAI

AI-powered maintenance platform.

## Tech Stack

| Layer           | Technology       | Version |
| --------------- | ---------------- | ------- |
| Monorepo        | Turborepo        | 2.x     |
| Package Manager | pnpm             | 9.x     |
| Backend         | NestJS (TypeScript) | 10.x |
| Frontend        | Next.js (React)  | 15.x    |
| Database        | PostgreSQL       | 15      |
| ORM             | Drizzle          | 0.45.x  |
| Auth            | Firebase Auth    | -       |
| Runtime         | Node.js          | 18.20.8 |

## Repository Structure

```
maintainium/
├── apps/
│   ├── api/          # NestJS backend (port 4000)
│   └── web/          # Next.js frontend (port 3000)
├── packages/         # Shared packages (future)
├── docs/             # Project documentation
├── turbo.json        # Turborepo pipeline config
├── pnpm-workspace.yaml
├── docker-compose.yml
└── CLAUDE.md         # AI coding controller
```

## Prerequisites

- **Node.js** >= 18.20.8 (see `.nvmrc`)
- **pnpm** >= 9.x
- **Docker** (for PostgreSQL)
- **Firebase project** with Authentication enabled (Email/Password + GitHub provider)

```bash
# Install correct Node version
nvm use

# Install pnpm if not already installed
npm install -g pnpm@9
```

## Getting Started

### 1. Start PostgreSQL

```bash
docker compose up -d
```

This starts a PostgreSQL 15 container on port 5432.

### 2. Configure Environment Variables

```bash
# API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your Firebase Admin SDK credentials

# Web
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env with your Firebase client config
```

### 3. Run Database Migrations

```bash
# Generate migration files from schema
pnpm --filter @maintainium/api db:generate

# Apply migrations to the database
pnpm --filter @maintainium/api db:migrate
```

### 4. Start Development

```bash
# Install all dependencies
pnpm install

# Start all apps in development mode
pnpm dev

# Build all apps
pnpm build
```

## Apps

### API (`apps/api`)

NestJS backend running on **http://localhost:4000**.

| Endpoint      | Method | Auth     | Description              |
| ------------- | ------ | -------- | ------------------------ |
| `/health`     | GET    | None     | Health check             |
| `/users/me`   | GET    | Required | Returns authenticated user record |

### Web (`apps/web`)

Next.js frontend running on **http://localhost:3000**.

| Route        | Description                              |
| ------------ | ---------------------------------------- |
| `/`          | Landing page with API health indicator   |
| `/login`     | Login (email/password + GitHub OAuth)    |
| `/signup`    | Sign up (email/password + GitHub OAuth)  |
| `/dashboard` | Protected dashboard (empty state for M1) |

## Firebase Setup

### Admin SDK (Backend)

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Use the values for `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in `apps/api/.env`

### Client SDK (Frontend)

1. Go to Firebase Console > Project Settings > General
2. Under "Your apps", add a Web app if none exists
3. Copy the Firebase config values to `apps/web/.env`

### Auth Providers

Enable the following in Firebase Console > Authentication > Sign-in method:
- **Email/Password**
- **GitHub** (requires GitHub OAuth App — set callback URL to your Firebase auth domain)

## Environment Variables

### API (`apps/api/.env`)

| Variable               | Description                        |
| ---------------------- | ---------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string       |
| `FIREBASE_PROJECT_ID`  | Firebase project ID                |
| `FIREBASE_CLIENT_EMAIL`| Firebase service account email     |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `PORT`                 | API port (default: 4000)           |
| `CORS_ORIGIN`          | Allowed CORS origin (default: http://localhost:3000) |

### Web (`apps/web/.env`)

| Variable                          | Description               |
| --------------------------------- | ------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`    | Firebase API key          |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`| Firebase auth domain      |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID       |
| `NEXT_PUBLIC_API_URL`             | Backend API URL (default: http://localhost:4000) |

## Database Commands

```bash
# Generate migration from schema changes
pnpm --filter @maintainium/api db:generate

# Apply pending migrations
pnpm --filter @maintainium/api db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm --filter @maintainium/api db:studio
```

## Git Workflow

| Branch    | Purpose                          |
| --------- | -------------------------------- |
| `main`    | Production-ready code            |
| `dev`     | Integration branch               |
| `feat/*`  | Feature branches (branch from `dev`) |
| `fix/*`   | Bug fix branches (branch from `dev`) |

## Documentation

| Document                            | Purpose                    |
| ----------------------------------- | -------------------------- |
| `CLAUDE.md`                         | AI coding controller       |
| `docs/features/authentication/feature.md` | Authentication feature doc |
| `docs/playbook/requirement-playbook.md`      | Requirement standards      |
| `docs/playbook/technical-requirement-playbook.md` | Technical req standards |
| `docs/playbook/security-playbook.md`         | Security review standards  |
| `docs/playbook/ui-ux-playbook.md`            | UI/UX standards            |
| `docs/playbook/feature-playbook.md`          | Feature doc standards      |
| `docs/Project-summary.md`           | Project overview           |
| `docs/agent-architecture.md`        | Agent architecture         |
| `docs/technincal-architecture.md`   | Technical architecture     |

## Useful Commands

```bash
# Development
pnpm dev              # Start all apps
pnpm build            # Build all apps
pnpm lint             # Lint all apps
pnpm format           # Format code with Prettier

# Run a command in a specific app
pnpm --filter @maintainium/api dev
pnpm --filter @maintainium/web dev

# Docker
docker compose up -d   # Start PostgreSQL
docker compose down    # Stop PostgreSQL
```
