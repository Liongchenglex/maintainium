# MaintainAI

AI-powered maintenance platform.

## Tech Stack

| Layer           | Technology       | Version |
| --------------- | ---------------- | ------- |
| Monorepo        | Turborepo        | 2.x     |
| Package Manager | pnpm             | 9.x     |
| Backend         | NestJS (TypeScript) | 10.x |
| Frontend        | Next.js (React)  | 15.x    |
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
└── CLAUDE.md         # AI coding controller
```

## Prerequisites

- **Node.js** >= 18.20.8 (see `.nvmrc`)
- **pnpm** >= 9.x

```bash
# Install correct Node version
nvm use

# Install pnpm if not already installed
npm install -g pnpm@9
```

## Getting Started

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

| Endpoint      | Method | Description  |
| ------------- | ------ | ------------ |
| `/health`     | GET    | Health check |

### Web (`apps/web`)

Next.js frontend running on **http://localhost:3000**.

Displays the project landing page with a live API health status indicator.

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
| `docs/playbook/requirement-playbook.md`      | Requirement standards      |
| `docs/playbook/technical-requirement-playbook.md` | Technical req standards |
| `docs/playbook/security-playbook.md`         | Security review standards  |
| `docs/playbook/ui-ux-playbook.md`            | UI/UX standards            |
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
```

## Environment Variables

No environment variables are required for the initial scaffold. As the project grows, create `.env` files (never committed) per app as needed.
