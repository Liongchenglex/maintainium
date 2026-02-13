# Maintanium — Backlog

Deferred features and enhancements, organized by area. Each item references the milestone or feature it relates to.

---

## Monitor Agent (M4)

### LLM-Enhanced Scanning — False Positive Reduction
**Priority:** High
**Depends on:** M4 (scanner infrastructure), M3 (analysis data)

Add an optional LLM triage pass as a second stage after deterministic scanning. Raw findings are produced first (fast, deterministic), then an LLM reviews them in batch to reduce false positives.

**Enhancement targets:**

| Scanner | Enhancement | Expected Impact |
|---|---|---|
| S1 — CVE | **Reachability analysis**: LLM reads the advisory description + the project's actual import/usage of the affected package to determine if the vulnerable code path is reachable | ~50-70% finding reduction |
| S3 — Secrets | **Context-aware filtering**: LLM examines surrounding code to distinguish real credentials from test fixtures, example configs, and base64 strings that match patterns | ~30-50% finding reduction |
| S4 — Auth Coverage | **Intent detection**: LLM reads handler code for unprotected routes to determine if the lack of auth is intentional (webhook receivers, OAuth callbacks, public endpoints) vs an oversight | ~40-60% finding reduction |
| S6 — Env Exposure | **Usage tracing**: LLM traces how a sensitive variable is actually used — whether it's bundled into client JS or only consumed server-side in config | ~30-40% finding reduction |

**Proposed implementation:**
- Scanners produce raw `FindingData[]` (unchanged)
- New `LlmTriageService` receives findings + analysis context
- LLM annotates each finding with `confidence` (0-1) and `reasoning`
- Findings below a configurable threshold are auto-downgraded to `info` severity
- Uses prompt caching pattern (B13) — shared project context in system message for cost efficiency
- Graceful degradation: if LLM is unavailable, raw findings are used as-is

---

### Performance Monitoring
**Priority:** Medium
**Depends on:** M4

- Core Web Vitals (LCP, FID, CLS) via Lighthouse or CrUX API
- Bundle size tracking per build
- Response time percentiles for API endpoints

### Content & SEO
**Priority:** Low
**Depends on:** M4

- Broken link crawling
- SEO auditing (meta tags, structured data, sitemap)
- Accessibility auditing (WCAG compliance)
- Content change / defacement detection

### External Integrations
**Priority:** Medium
**Depends on:** M4

- Error rate monitoring via Sentry integration
- Third-party service status tracking
- Database connection health checks

### Infrastructure Monitoring
**Priority:** Medium
**Depends on:** M4

- Domain/DNS/WHOIS monitoring
- Multi-region uptime checks
- License compliance scanning

---

## Scheduled Scanning (M10)

### Cron-Based Automated Scans
**Priority:** High
**Depends on:** M4

- Reuse M4 scanner infrastructure with cron/Cloud Scheduler trigger
- Configurable frequency per project (daily, weekly)
- Results appear in the same Monitor tab and issue feed

---

## Issue Dashboard (M5)

### Maintenance Scoring System
**Priority:** High
**Depends on:** M4

- 1-100 score based on finding severity and count
- Liability tier mapping (Tier 1-4)
- Score history tracking over time

### Issue Feed & Detail View
**Priority:** High
**Depends on:** M4

- Chronological issue feed across all projects
- Issue cards with score, tier, classification
- Detail view with plain-language explanation, root cause, recommended action

---

## Notes

- Items are roughly ordered by priority within each section
- "Depends on" indicates which milestone must be complete before work can begin
- Refer to `docs/milestones.md` for the full milestone dependency chain
- Refer to each feature's `docs/features/<feature>/feature.md` for implementation details
