# Monitor Agent (M4) — Feature Doc

## Overview

The Monitor Agent surfaces actionable findings from codebase analysis data (M3) and performs live checks (uptime, SSL) against a user-provided production URL. It deduplicates findings across scans and tracks finding lifecycle (open → resolved / dismissed).

## Key Files

### Backend

| File | Purpose |
|---|---|
| `apps/api/src/database/schema/monitor-scans.ts` | Schema: `monitor_scans`, `scan_findings` tables + enums |
| `apps/api/src/database/schema/projects.ts` | Added `productionUrl` column |
| `apps/api/src/monitor/monitor.constants.ts` | Event names, scanner IDs |
| `apps/api/src/monitor/monitor.interfaces.ts` | ScanContext, FindingData, ScannerResult types |
| `apps/api/src/monitor/monitor.service.ts` | Orchestrator: runs scanners, dedup, health status |
| `apps/api/src/monitor/monitor.controller.ts` | API endpoints for scan/findings/dismiss |
| `apps/api/src/monitor/monitor.module.ts` | NestJS module |
| `apps/api/src/monitor/dto/update-production-url.dto.ts` | Validation for PATCH /projects/:id |
| `apps/api/src/monitor/scanners/*.scanner.ts` | 8 scanner implementations (S1-S7a) |
| `apps/api/src/projects/projects.controller.ts` | Added PATCH /:id endpoint |
| `apps/api/src/projects/projects.service.ts` | Added updateProject method |
| `apps/api/src/analysis/analysis.service.ts` | Emits `analysis.completed` event |

### Frontend

| File | Purpose |
|---|---|
| `apps/web/src/lib/api.ts` | Added `patch()` method |
| `apps/web/src/components/monitor/monitor-overview.tsx` | Monitor tab component |
| `apps/web/src/components/projects/project-detail.tsx` | Added Monitor tab |

## Data Model

### `monitor_scans` table
Tracks individual scan runs (status, trigger, duration, finding counts).

### `scan_findings` table
Individual findings with fingerprint-based deduplication. Unique constraint on `(project_id, fingerprint)`.

### `projects.production_url`
Nullable text field for user-configured production URL.

## API Contracts

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/projects/:id/scan` | AuthGuard + ownership | Trigger scan |
| GET | `/projects/:id/scans` | AuthGuard + ownership | List scan history |
| GET | `/projects/:id/findings` | AuthGuard + ownership | List findings (filterable) |
| POST | `/projects/:id/findings/:findingId/dismiss` | AuthGuard + ownership | Dismiss finding |
| PATCH | `/projects/:id` | AuthGuard + ownership | Update productionUrl |

## Scanners

| ID | Name | Data Source | External API |
|---|---|---|---|
| s1-cve | Dependency CVEs | dependency_inventory | GitHub Advisory API |
| s2-freshness | Dependency Freshness | dependency_inventory | npm registry |
| s3-secrets | Hardcoded Secrets | security_metadata | None |
| s4-auth-coverage | Auth Coverage | api_surface | None |
| s5-code-health | Code Health | dependency_graph | None |
| s6-env-exposure | Env Exposure | project_metadata + file_registry | None |
| s7-uptime | Uptime/HTTP | project.productionUrl | HTTP GET |
| s7a-ssl | SSL/TLS | project.productionUrl | TLS handshake |

## Flows

### Auto-trigger
```
M3 analysis completes → emit 'analysis.completed'
  → MonitorService.handleAnalysisCompleted
  → runScan (S1-S6, and S7/S7a if productionUrl set)
  → persist findings (dedup by fingerprint)
  → update project healthStatus
```

### Manual scan
```
User clicks "Run Scan" → POST /projects/:id/scan
  → concurrency check (409 if already scanning)
  → async runScan → poll via GET /scans
```

### Deduplication
- Each finding has a stable `fingerprint` (SHA-256 of scanner ID + identifying fields)
- Existing open finding → update `lastSeenAt`
- New fingerprint → insert
- Open findings not seen in scan → auto-resolve
- Dismissed findings → stay dismissed (not re-opened)

### Health Status
| Worst Open Finding | healthStatus |
|---|---|
| critical | `critical` |
| high | `warning` |
| medium/low/info/none | `healthy` |

## S1 CVE Scanner — Optimization Strategy

The CVE scanner queries the GitHub Advisory API for each dependency, which is the most API-intensive scanner. Several optimizations are in place to avoid rate limiting and minimize latency.

### Scope Reduction
- Only **direct** and **framework-critical** dependencies are checked (filtered from `dependencyInventory`)
- Transitive-only dependencies are skipped — they carry lower exploit risk and inflate API calls
- Hard cap of **50 packages** per scan (sorted: framework-critical first, then direct)

### In-Memory Cache
- Advisory results are cached per package name with a **1-hour TTL**
- Cache is process-scoped (`Map` in module scope) — shared across all scans within the same API instance
- On cache hit, no API call is made; the cached advisories are reused

### Rate Limiting
- **150ms delay** between consecutive API calls (burst prevention)
- On HTTP 429: respects `retry-after` header with exponential backoff (up to 3 retries)
- API call count and cache hit count are logged per scan for observability

### Authentication
- Uses an org member's decrypted GitHub token (looked up via `findGithubTokenForProject`)
- Authenticated requests get a higher rate limit (5,000 req/hr vs 60 req/hr unauthenticated)

### Known Tradeoffs

| Tradeoff | Detail |
|---|---|
| **Transitive deps not checked** | A vulnerable transitive dependency won't be flagged unless it also appears as a direct dep. Acceptable for M4 scope — transitive CVE detection can be added via `npm audit`-style integration later. |
| **Process-scoped cache** | Cache is lost on API restart. Not shared across multiple instances in a horizontally scaled deployment. Acceptable for single-instance M4 — can be moved to Redis if needed. |
| **Conservative version matching** | `isVersionAffected` uses a heuristic (flags if any advisory exists for the package) rather than full semver range evaluation. May produce false positives. A semver library (`semver`) would improve precision — deferred to backlog LLM triage (reachability analysis). |
| **50-package cap** | Projects with >50 direct dependencies will have partial CVE coverage. In practice, most projects have 20-40 direct deps. Cap can be raised if rate limit headroom allows. |
| **1-hour cache TTL** | Newly published advisories won't appear until cache expires. Acceptable given scans are on-demand, not real-time alerting. |

---

## Pattern: Scanner (B14)

Each scanner is an `@Injectable()` class with a single `scan(context: ScanContext): Promise<FindingData[]>` method. Scanners are stateless, receive context (project + analysis data), and return an array of findings. The orchestrator (MonitorService) handles persistence, dedup, and error wrapping.

## Dependencies

- Depends on: M2 (projects), M3 (codebase analysis)
- Depended on by: M5 (issue dashboard, maintenance scoring)
