# Monitor Agent — Formal Requirements (M4)

## Context & Intent

### Who is this for?
Non-technical or semi-technical project owners who have connected a GitHub repo via M2 and have a codebase analysis from M3. They need ongoing health surveillance without manually auditing their codebase.

### Why does it matter?
Vibe-coded apps accumulate silent risks: vulnerable dependencies, exposed secrets, unprotected API routes, dead code. The Codebase Intelligence Agent (M3) already detects many of these statically — the Monitor Agent surfaces them as actionable issues with severity scoring and ongoing tracking.

### What is explicitly NOT included (M4 scope)?
- Performance monitoring (Core Web Vitals, Lighthouse) — **backlog**
- Broken link crawling — **backlog**
- SEO / accessibility auditing — **backlog**
- Error rate monitoring (Sentry integration) — **backlog**
- API endpoint health checks (user-configured) — **backlog**
- Database connection health — **backlog**
- License compliance scanning — **backlog**
- Bundle size tracking — **backlog**
- Domain/DNS/WHOIS monitoring — **backlog**
- Multi-region uptime checks — **backlog**
- Content change / defacement detection — **backlog**
- Third-party service status tracking — **backlog**
- Maintenance scoring system (FR-2.2) — **M5** (requires issue dashboard)
- Issue feed and detail view (FR-2.3, FR-7.3) — **M5**
- Scheduled/cron-based automated scans — **M10** (M4 = on-demand + first-scan)
- LLM-enhanced scanning (false positive reduction) — **backlog** (see below)

#### LLM Enhancement Opportunities (Backlog)

The current M4 scanners are purely deterministic. An optional LLM triage pass could be added as a second stage to reduce false positives and improve signal quality:

- **S1 CVE — Reachability analysis**: LLM reads the advisory description + the project's actual usage of the affected package to determine if the vulnerable code path is reachable. Expected reduction: ~50-70% of CVE findings.
- **S3 Secrets — Context-aware filtering**: LLM examines surrounding code to distinguish real credentials from test fixtures, example configs, and base64 strings that match secret patterns.
- **S4 Auth Coverage — Intent detection**: LLM reads handler code for unprotected routes to determine whether the lack of auth is intentional (webhook receivers, OAuth callbacks, public endpoints) vs an oversight.
- **S6 Env Exposure — Usage tracing**: LLM traces how a sensitive variable is actually used — whether it's bundled into client JS or only consumed server-side in config.

**Proposed implementation pattern**: Scanners produce raw findings (fast, deterministic) → optional LLM triage reviews findings in batch → annotates each with a `confidence` score (0-1) and reasoning → findings below a configurable threshold are auto-downgraded to `info` severity. Uses the same prompt caching pattern as M3 (B13) to keep costs low.

---

## Scan Categories (M4 Scope)

### S1: Dependency Vulnerabilities (Must-Have)
- **Source:** `codebase_analyses.dependency_inventory` (package names + versions)
- **External API:** GitHub Advisory Database API (`GET /advisories`) — uses existing GitHub token
- **Logic:** For each dependency, query GitHub Advisory for known CVEs matching the package name and version range
- **Output per finding:** package name, installed version, advisory ID, severity (critical/high/medium/low), patched version (if available), advisory URL
- **Frequency:** On-demand scan + auto-trigger on analysis completion

### S2: Dependency Freshness (Must-Have)
- **Source:** `codebase_analyses.dependency_inventory` (package names + versions)
- **External API:** npm registry (`GET https://registry.npmjs.org/{package}`)
- **Logic:** Compare `currentVersion` against `latest` from registry. Calculate major version delta. Flag: >2 major versions behind, or package marked deprecated
- **Output per finding:** package name, installed version, latest version, major versions behind, deprecated flag
- **Frequency:** On-demand scan + auto-trigger on analysis completion

### S3: Hardcoded Secrets (Must-Have)
- **Source:** `codebase_analyses.security_metadata.hardcodedSecrets`
- **External API:** None — already detected by M3
- **Logic:** Surface each entry from M3's security analysis as a critical finding
- **Output per finding:** file path, matched pattern description
- **Frequency:** On-demand scan + auto-trigger on analysis completion

### S4: Auth Coverage (Must-Have)
- **Source:** `codebase_analyses.api_surface.routes`
- **External API:** None — already detected by M3
- **Logic:** Flag routes where `auth === false` or `auth === 'unknown'`. Exclude common public routes (health check, public assets)
- **Exclusion list:** Routes matching `/health`, `/ping`, `/public`, `/assets`, `/favicon`, `/_next`
- **Output per finding:** route method, route path, handler file, auth status
- **Frequency:** On-demand scan + auto-trigger on analysis completion

### S5: Code Health (Must-Have)
- **Source:** `codebase_analyses.dependency_graph` (orphans, circularDependencies)
- **External API:** None — already detected by M3
- **Logic:** Surface orphan files (no imports/exports) and circular dependency chains
- **Output per finding:**
  - Orphans: file path, file category
  - Circular deps: array of file paths forming the cycle
- **Severity:** Low (informational — code quality, not security)
- **Frequency:** On-demand scan + auto-trigger on analysis completion

### S6: Environment Exposure (Must-Have)
- **Source:** `codebase_analyses.security_metadata` + `codebase_analyses.project_metadata.envVariables`
- **External API:** None — already detected by M3
- **Logic:** Cross-reference env variables referenced in code against known sensitive variable patterns (`*_SECRET`, `*_KEY`, `*_TOKEN`, `*_PASSWORD`, `DATABASE_URL`, `PRIVATE_KEY`). Flag if these appear in client-side files (category: `component`, `page`)
- **Output per finding:** variable name, file path where referenced, risk (client-exposed vs server-only)
- **Frequency:** On-demand scan + auto-trigger on analysis completion

### S7: Uptime / HTTP Health (Must-Have)
- **Source:** User-provided production URL (new field on project)
- **External API:** Direct HTTP(S) GET request to the URL
- **Logic:** Send GET request with 10-second timeout. Record: HTTP status code, response time (ms), whether response body is non-empty. Flag: non-2xx status, timeout, DNS resolution failure
- **Output per check:** timestamp, status code, response time ms, pass/fail, error message (if failed)
- **Requires:** New `productionUrl` field on projects table (nullable, user-configured)
- **Frequency:** On-demand only in M4 (scheduled/cron deferred to M10)

### S7a: SSL/TLS Certificate (Must-Have)
- **Source:** User-provided production URL (same as S7)
- **External API:** TLS handshake to extract certificate info
- **Logic:** Connect via TLS, extract: issuer, subject, valid from, valid to, days until expiry, protocol version. Flag: expired, expiring within 30 days, using TLS < 1.2
- **Output per check:** domain, issuer, expiry date, days remaining, TLS version, pass/fail, warning level (30/14/7 day thresholds)
- **Requires:** Same `productionUrl` field as S7
- **Frequency:** On-demand only in M4 (scheduled/cron deferred to M10)

---

## Actual Flow

### Flow A: First Scan (Auto-Trigger on Analysis Completion)

```
M3 analysis completes → emit 'analysis.completed' event
  → MonitorService.handleAnalysisCompleted({ projectId })
  → Run scanners S1-S6 (static scans from analysis data)
  → If project has productionUrl: also run S7, S7a
  → Store results in monitor_scans + scan_findings tables
  → Update project healthStatus
```

### Flow B: Manual Scan (User-Initiated)

```
User → clicks "Run Scan" on Monitor tab
  → POST /projects/:id/scan (AuthGuard)
  → Validate project ownership
  → Concurrency guard: if scan status is 'scanning', return 409
  → Run all applicable scanners (S1-S7a)
  → Store results
  → Return scan summary
```

### Flow C: Configure Production URL

```
User → opens Monitor tab → sees "Add production URL" prompt
  → Enters URL → PATCH /projects/:id (AuthGuard)
  → Validate URL format (must be https:// or http://)
  → Store productionUrl on project record
  → Uptime and SSL scans now included in scan runs
```

---

## Step-by-Step Behaviour

### Scan Execution

1. Create `monitor_scans` record with status `scanning`
2. Read latest `codebase_analyses` record for the project
3. If no analysis exists or status is not `completed`, skip static scans (S1-S6) and log warning
4. Run each scanner sequentially (S1 → S2 → S3 → S4 → S5 → S6 → S7 → S7a)
5. Each scanner produces an array of findings
6. **Deduplication:** For each finding, generate a stable `fingerprint` (hash of: scan type + identifying fields). Before inserting, check if an open finding with the same fingerprint already exists for this project. If yes, update `lastSeenAt` timestamp. If no, insert new finding.
7. Mark findings from previous scans that were NOT seen in this scan as `resolved` (auto-close)
8. Update `monitor_scans` record with status `completed`, total findings count, duration
9. Update project `healthStatus` based on worst active finding severity

### Health Status Derivation

| Worst Active Finding | Project healthStatus |
|---|---|
| Any critical severity | `critical` |
| Any high severity (no critical) | `warning` |
| Only medium/low/info | `healthy` |
| No findings | `healthy` |

---

## Data Model

### `monitor_scans` table

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Scan record ID |
| `project_id` | UUID FK → projects | Which project was scanned |
| `status` | enum: pending/scanning/completed/failed | Scan state |
| `trigger` | enum: manual/auto/scheduled | What initiated the scan |
| `scanners_run` | text[] | Which scanners were executed (e.g., ['s1-cve', 's2-freshness', ...]) |
| `total_findings` | integer | Count of findings from this scan |
| `new_findings` | integer | Findings not seen in previous scan |
| `resolved_findings` | integer | Previously open findings now resolved |
| `duration_ms` | integer | How long the scan took |
| `error_message` | text nullable | Error details on failure |
| `created_at` | timestamp | Scan start time |
| `completed_at` | timestamp nullable | Scan end time |

### `scan_findings` table

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Finding ID |
| `project_id` | UUID FK → projects | Which project |
| `scan_id` | UUID FK → monitor_scans | Which scan first detected this |
| `scanner` | text | Scanner ID (e.g., 's1-cve', 's4-auth-coverage') |
| `fingerprint` | text | Stable hash for deduplication |
| `severity` | enum: critical/high/medium/low/info | Finding severity |
| `title` | text | Short description (e.g., "CVE-2024-1234 in lodash") |
| `description` | text | Detailed explanation |
| `details` | JSONB | Scanner-specific structured data |
| `status` | enum: open/resolved/dismissed | Finding lifecycle |
| `first_seen_at` | timestamp | When first detected |
| `last_seen_at` | timestamp | When last confirmed in a scan |
| `resolved_at` | timestamp nullable | When resolved or dismissed |
| `created_at` | timestamp | Record creation |

**Unique constraint:** `(project_id, fingerprint)` — one open finding per fingerprint per project.

### Project table addition

| Column | Type | Description |
|---|---|---|
| `production_url` | text nullable | User-provided production URL for uptime/SSL checks |

---

## API Contracts

### POST /projects/:id/scan

**Auth:** Required (AuthGuard)
**Ownership:** Project membership check via `findByIdWithAuth`

**Request:** Empty body

**Response (200):**
```json
{ "message": "Scan started", "scanId": "uuid" }
```

**Response (409):**
```json
{ "message": "Scan already in progress" }
```

### GET /projects/:id/scans

**Auth:** Required (AuthGuard)

**Response (200):** Array of `monitor_scans` records, ordered by `created_at DESC`, limit 20

### GET /projects/:id/findings

**Auth:** Required (AuthGuard)
**Query params:** `status` (open/resolved/dismissed, default: open), `severity` (filter), `scanner` (filter)

**Response (200):** Array of `scan_findings` records matching filters

### PATCH /projects/:id

**Auth:** Required (AuthGuard)
**Body:** `{ "productionUrl": "https://myapp.com" }` (or `null` to remove)

**Response (200):** Updated project record (without secrets)

### POST /projects/:id/findings/:findingId/dismiss

**Auth:** Required (AuthGuard)

**Response (200):** Updated finding with status `dismissed`

---

## Frontend: Monitor Tab

### Location
New tab on project detail page (`/dashboard/projects/:id`) alongside existing "Files" and "Analysis" tabs.

### States

**No scans yet (empty state):**
- Message: "No scans have been run yet."
- "Run First Scan" button (primary CTA)
- "Add Production URL" input if `productionUrl` is null (inline, not a separate page)

**Scan in progress:**
- Spinner with "Scanning..." text
- Poll `GET /projects/:id/scans` every 5 seconds (same pattern as analysis polling)

**Scan completed — findings view:**
- Summary bar: total open findings by severity (critical: red, high: orange, medium: yellow, low: grey)
- Findings list grouped by scanner category
- Each finding shows: severity badge, title, description preview, first seen date
- "Dismiss" action per finding (with confirmation)
- "Re-scan" button in header
- Filter by: severity, scanner type, status (open/dismissed/resolved)

**Production URL section:**
- Input field for production URL with save button
- If set: show latest uptime check result (status code, response time) and SSL expiry info
- If not set: prompt "Add your production URL to enable uptime and SSL monitoring"

### Auto-refresh
Poll `GET /projects/:id/findings?status=open` every 30 seconds while the Monitor tab is active (findings may be resolved by a new scan triggered elsewhere).

---

## Edge Cases

- **No analysis exists:** Skip static scans (S1-S6). Only run S7/S7a if production URL is set. Show message: "Run a codebase analysis first to enable full scanning."
- **Analysis is stale:** Run scans against whatever analysis data exists. The scan results reflect the last-analyzed state, not the current repo HEAD. Show "Last analyzed: {date}" warning if analysis is older than 7 days.
- **Concurrent scan:** Return 409. Only one scan per project at a time.
- **GitHub Advisory API rate limit:** Retry with exponential backoff (3 attempts). If exhausted, mark S1 as failed, continue with other scanners.
- **npm registry timeout:** 5-second timeout per package. Skip packages that timeout, log warning, continue.
- **Production URL unreachable:** Record as a failed uptime check (not a scan failure). The finding itself is "site unreachable."
- **SSL handshake failure:** Record as a finding (e.g., "SSL certificate could not be verified"). Not a scan failure.
- **Duplicate scan trigger:** If `analysis.completed` event fires and a scan is already running, skip silently (concurrency guard).
- **Large dependency list:** Cap CVE lookup at 200 packages. If more, scan the first 200 (sorted by `isFrameworkCritical` first, then `isDirect` first).
- **Finding resolved then re-appears:** If a dismissed finding reappears in a new scan, create a new finding (new `id`) with status `open`. The old dismissed finding remains as-is.

---

## Failure Scenarios

| Scenario | Behaviour |
|---|---|
| No analysis data | Skip S1-S6, warn in scan results, run S7/S7a only if URL set |
| GitHub API rate limit (S1) | Retry 3x with backoff, then mark S1 as failed in scan record |
| npm registry unreachable (S2) | 5s timeout per package, skip timed-out packages, partial results |
| Production URL returns 5xx (S7) | Record as critical finding "Site returning server error", scan succeeds |
| TLS handshake fails (S7a) | Record as critical finding "SSL verification failed", scan succeeds |
| Scan process crashes | Catch at top level, set scan status to `failed` with error message |
| Unauthorized (no auth token) | 401 response, scan not started |
| Project not found | 404 response |
| Access denied (not org member) | 403 response |

---

## Acceptance Criteria

### Backend
- [ ] `POST /projects/:id/scan` triggers a scan and returns scan ID
- [ ] Scan runs all applicable scanners based on available data (analysis + production URL)
- [ ] Findings are deduplicated by fingerprint — re-scanning does not create duplicate findings
- [ ] Findings no longer detected in a scan are auto-resolved
- [ ] `GET /projects/:id/findings` returns findings filtered by status/severity/scanner
- [ ] `POST /projects/:id/findings/:findingId/dismiss` marks a finding as dismissed
- [ ] `PATCH /projects/:id` accepts `productionUrl` and validates format
- [ ] Scan auto-triggers when codebase analysis completes
- [ ] Concurrent scan returns 409
- [ ] Project `healthStatus` updates based on worst active finding severity
- [ ] Auth enforced on all endpoints (AuthGuard + project ownership check)

### Frontend
- [ ] Monitor tab appears on project detail page
- [ ] Empty state shows "Run First Scan" CTA
- [ ] Production URL input with save functionality
- [ ] Scan progress shown with spinner and auto-refresh
- [ ] Findings list with severity badges, grouped by category
- [ ] Filter by severity, scanner, status
- [ ] Dismiss action on individual findings
- [ ] Re-scan button in header
- [ ] Latest uptime/SSL status shown when production URL is set

---

## Open Questions (Resolved)

| # | Question | Resolution |
|---|---|---|
| 1 | Where does the Monitor tab live? | New tab on project detail page alongside Files and Analysis |
| 2 | Scheduled scans in M4? | No — on-demand and auto-trigger only. Scheduled scans deferred to M10 |
| 3 | Which external APIs? | GitHub Advisory (CVE) + npm registry (freshness) + HTTP/TLS (uptime/SSL) |
| 4 | How to handle scans when no analysis exists? | Skip static scans, run live checks only, show warning |
