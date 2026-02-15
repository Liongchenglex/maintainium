# Visual Preview — Backlog

## Server-Side Proxy (Option A)

**Status:** Deferred

**Problem:** Both the bookmarklet and script tag require client-side JavaScript injection. Some sites have strict CSP headers that block inline scripts or external script sources, preventing the overlay from loading.

**Proposed Solution:** The Maintanium API acts as a reverse proxy — it fetches the user's production page server-side, injects the overlay `<script>` tag into the HTML, and serves the modified page at a Maintanium-hosted URL (e.g., `app.maintanium.dev/preview/{projectId}`). The user opens that URL instead of their real site.

**Benefits:**
- Zero-code, zero-config — no bookmarklet or script tag needed
- Bypasses CSP restrictions entirely
- Works for users who can't modify their site's HTML or bookmarks bar

**Trade-offs:**
- Proxied pages may break if the site relies on same-origin cookies, relative paths, or anti-framing headers
- Adds server-side complexity (HTML parsing, rewriting asset URLs, handling redirects)
- Latency overhead from proxying every page load

**Dependencies:**
- Overlay script must work when injected into proxied HTML (same as current behavior)
- May need HTML parser (e.g., `cheerio`) on the API side

---

## Security Improvements (from M7 security review)

### Rate limiting on overlay endpoint
- **Severity:** Medium
- **Status:** Deferred
- **Issue:** A leaked publishable API key could spam `POST /projects/:id/preview/changes`, triggering expensive LLM calls
- **Recommendation:** Add per-project rate limit (e.g., 10 changes/hour) via a NestJS guard or `@nestjs/throttler`

### Scope CORS to preview endpoints only
- **Severity:** Low
- **Status:** Deferred
- **Issue:** `main.ts` CORS callback allows all origins globally, not just for overlay endpoints
- **Recommendation:** Restrict CORS to allowed origins by default; only bypass for `/projects/*/preview/changes`

### LLM prompt injection hardening
- **Severity:** Low (mitigated)
- **Status:** Deferred
- **Issue:** User-supplied `requestedChange` could craft input to trick LLM into modifying unintended code
- **Current mitigation:** User text goes only in user message (never system prompt), and output is reviewed by user before Apply
- **Recommendation:** Add output validation — verify `targetFilePath` is in the candidate file list before accepting LLM response
