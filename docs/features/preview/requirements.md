# Visual Preview & Apply — M7 MVP Requirements

## Status: DRAFT — Pending user approval on remaining open decisions

---

## 1. Context & Intent

### Who is this for?
Vibe coders / non-technical project owners who want to make visual changes to their deployed web app (copy, styling, layout tweaks) by pointing at what they see and describing what they want — without touching code directly.

### Why does it matter?
This closes the loop from "I see a problem" to "it's fixed and deployed" entirely within Maintanium. Combined with M3 (codebase intelligence), M4 (monitoring), and M5b (issue diagnosis), this is the **action layer** — the feature that turns insights into applied changes.

### What is explicitly NOT included? (M7 MVP)
- React fiber walking / DOM inspection (deferred — fragile, React-only, broken by SSR)
- Screenshot capture / upload / vision API (deferred — requires image storage infrastructure)
- Multi-framework support beyond what M3 can index (deferred)
- Real-time preview hot-reload (deferred — depends on deploy pipeline speed)
- Bulk changes / multi-file refactors in a single request (deferred)
- Direct main branch commits (safety constraint — always branch + PR)
- iframe embedding (eliminated — new tab approach is simpler and avoids cross-origin issues entirely)

---

## 2. Architecture Decision: New Tab + Embeddable Script

### Why new tab instead of iframe?

The original braindump considered iframe embedding. We rejected it because:

1. **Cross-origin security**: The browser Same-Origin Policy prevents injecting scripts into cross-origin iframes. The user's site at `https://myapp.vercel.app` is a different origin from Maintanium — no DOM access, no script injection, no element capture.
2. **X-Frame-Options / CSP**: Many sites block iframe embedding entirely. Would require users to configure their deployment headers.
3. **Redundant with embeddable script**: Since the overlay script already runs inside the user's site, it can talk directly to the Maintanium API via `fetch()`. No parent frame or `postMessage` bridge needed.

### Chosen approach: Embeddable script tag + new tab

The user adds a `<script>` tag to their site (one-time setup, same pattern as Hotjar/Intercom/Vercel Toolbar). The script:
- Renders a floating Maintanium toolbar on the user's site
- Provides annotate mode (element highlight + click capture)
- Sends captured context directly to the Maintanium API
- Shows status notifications (change submitted, PR created)

The **Preview tab** in Maintanium serves as the **control panel**: setup, change history, diff review, and apply.

### What this eliminates

| Removed | Reason |
|---------|--------|
| iframe embedding | No cross-origin issues, no X-Frame-Options blocking |
| `postMessage` bridge | Script talks directly to API via `fetch()` |
| Split-view layout | Simpler tab: setup + change history + diffs |
| iframe load detection | Not needed |
| Fallback text-input UI | Script is the primary interface; Maintanium tab is for review/apply |

---

## 3. Actual Flow (End-to-End)

### Setup (one-time per project)

```
1. User navigates to Project Detail → Preview tab
2. If no preview URL configured:
   a. System prompts: "Enter your deployed site URL" (e.g., https://myapp.vercel.app)
   b. URL stored in projects.previewUrl column
3. System generates a preview API key for the project (stored in projects.previewApiKey)
4. System shows setup instructions:
   a. "Add this script to your site's <head>:"
   b. <script src="https://api.maintanium.dev/preview/overlay.js"
        data-project="{projectId}"
        data-key="{previewApiKey}">
      </script>
5. User deploys with script included
6. Setup complete — user can now annotate from their live site
```

### Change Request Flow (happy path)

```
1. User clicks "Open Preview" in Maintanium → new browser tab opens at previewUrl
2. Overlay script initializes on the user's site:
   a. Validates data-project + data-key against Maintanium API
   b. Renders floating toolbar (bottom-right corner): [Annotate] [Changes (0)] [×]
3. User clicks "Annotate" on the toolbar → enters annotate mode:
   a. Cursor changes to crosshair
   b. Hovered elements get a highlight border (2px solid, semi-transparent overlay)
   c. ESC key or clicking toolbar exits annotate mode
4. User clicks an element (e.g., a heading that says "Start Now")
5. Overlay script captures:
   - elementText: "Start Now"
   - cssSelector: "main > section:nth-child(1) > h1"
   - tagName: "h1"
   - computedStyles: { fontSize, color, fontWeight } (subset)
   - currentUrl: window.location.pathname (e.g., "/pricing")
   - viewportWidth / viewportHeight
6. Overlay script shows an inline panel (slide-up from bottom or popover near element):
   - Shows: "Selected: <h1> 'Start Now'"
   - Text input: "What should this change to?"
   - [Submit] [Cancel] buttons
7. User types: "Change this to say 'Get Started Free'" → clicks Submit
8. Overlay script sends POST /projects/:id/preview/changes:
   {
     currentUrl: "/pricing",
     elementText: "Start Now",
     cssSelector: "main > section:nth-child(1) > h1",
     tagName: "h1",
     requestedChange: "Change this to say 'Get Started Free'"
   }
   Headers: { Authorization: "Bearer {previewApiKey}" }
9. Backend AI agent:
   a. Loads M3 analysis for the project
   b. Uses currentUrl + M3 apiSurface/fileRegistry to identify the page component
   c. Fetches the candidate file(s) from GitHub
   d. Searches for elementText in the file(s)
   e. Generates the code change (text replacement, style change, etc.)
   f. Returns proposed diff + status
10. Overlay script shows notification: "Change ready — review in Maintanium"
    - Badge on toolbar: [Changes (1)]
    - Clicking notification or badge opens Maintanium Preview tab in the original tab
11. User switches to Maintanium Preview tab → sees pending change:
    - Change summary: "'Start Now' → 'Get Started Free' in /pricing"
    - DiffView showing the proposed code change
    - [Apply] [Dismiss] buttons
12. User reviews diff → clicks "Apply"
13. Backend applies:
    a. Creates branch: maintanium/preview-{shortId}
    b. Commits the changed file(s) to the branch
    c. Creates a PR: "[Maintanium Preview] {summary}" targeting default branch
    d. Returns PR URL + updates change status to 'applied'
14. Frontend shows: "PR created" with link to PR
    - User's CI/CD (Vercel/Netlify) auto-deploys the branch → preview URL updates
```

---

## 4. Step-by-Step Behaviour

### Preview URL Configuration
- If `projects.previewUrl` is null → show setup prompt
- If `projects.previewUrl` is set → show "Open Preview" button + change history
- URL must be HTTPS (reject HTTP)
- URL validated on save: format check only (no backend ping — site may be behind auth)

### Preview API Key
- Generated on first preview setup: `crypto.randomBytes(32).toString('hex')`
- Stored in `projects.previewApiKey` column (plaintext — not a secret, scoped to project)
- Used by overlay script to authenticate API calls
- Can be regenerated (revokes old key)

### Overlay Script Authentication
- Script sends `data-project` + `data-key` on every API call
- Backend validates: key matches `projects.previewApiKey` for the given project ID
- Invalid key → 401 response → script shows "Invalid API key" error
- No user auth required on overlay API calls (project-scoped key is sufficient — the script runs on the user's own site)

### Overlay Script Behaviour
- Self-contained: renders its own UI (toolbar, panels) using shadow DOM to avoid style conflicts
- Annotate mode: mouseover highlight via `outline` CSS (non-destructive, no layout shift)
- Element capture: walks up to nearest meaningful element (skip `<span>`, `<br>`, prefer `<h1>`, `<p>`, `<button>`, `<a>`, `<div>` with text)
- Exits annotate mode after capture (single element per annotation)
- Multiple annotations allowed: each creates a separate change request

### AI File Matching (Backend)
- Input: `{ currentUrl, elementText, cssSelector?, tagName, requestedChange }`
- Step 1: Use M3 `apiSurface.routes` to find which route handler serves `currentUrl`
- Step 2: Use M3 `fileRegistry` to find page/component files associated with that route
- Step 3: Fetch candidate files from GitHub (max 5, using existing `GitHubService.getFileContent`)
- Step 4: Text search for `elementText` in the fetched files
- Step 5: If found → pass to LLM with the file content + requested change for precise diff generation
- Step 6: If NOT found → LLM uses M3 context + file content to infer the location
- Step 7: Return `{ filePath, originalContent, modifiedContent, diff }`

### Branch + Commit + PR
- Branch name: `maintanium/preview-{changeId}` (short UUID)
- If branch already exists for this change → reuse it (update commit)
- Commit message: `preview: {brief summary of change}`
- PR title: `[Maintanium Preview] {brief summary}`
- PR body: includes original text, requested change, affected file, auto-generated by Maintanium
- PR targets the project's `githubDefaultBranch`

---

## 5. Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Element text not found in any file | AI falls back to M3 context-based search. If still not found → "Could not locate this element in the codebase. Try describing the component or page name." |
| Multiple files contain the same text | AI uses cssSelector + URL context + M3 file purposes to disambiguate. If ambiguous → return top match with confidence note. |
| User submits change for a file not in M3 analysis | Return: "Codebase analysis may be outdated. Consider re-running analysis." Proceed with best-effort matching. |
| GitHub token expired/missing | Return error to overlay script → script shows "GitHub connection required. Reconnect in Maintanium." |
| Overlay script version mismatch | Script sends version on init. If outdated → API returns warning → script shows "Update available" banner. |
| User submits empty requestedChange | Client-side validation: "Please describe the change you want." |
| PR already exists for the same branch | Update the existing PR (force-push to same branch) rather than creating a duplicate. |
| Overlay script on wrong domain | Script checks `window.location.origin` against registered `previewUrl` origin. Mismatch → script does not activate. |
| User has no M3 analysis | Return: "Run codebase analysis first to enable preview changes." |
| Site uses dynamic rendering (SPA routes) | `currentUrl` is `window.location.pathname` which reflects SPA routes. M3 route matching handles both file-system and dynamic routes. |

---

## 6. Failure Modes

| Failure | HTTP | User-facing message (shown in overlay script or Maintanium) |
|---------|------|-------------------------------------------------------------|
| Preview URL not configured | N/A | Setup prompt shown in Preview tab |
| Invalid preview API key | 401 | Overlay: "Invalid API key. Check your script tag configuration." |
| AI cannot find file | 200 | `{ status: "no-match", message: "Could not locate this element..." }` |
| AI LLM unavailable | 503 | "AI service temporarily unavailable. Try again shortly." |
| GitHub API error (branch/commit/PR) | 502 | "Failed to create changes in GitHub. Check your connection." |
| GitHub rate limit | 429 | "GitHub API rate limit reached. Try again in X minutes." |
| File too large for LLM context | 200 | AI truncates file, proceeds with best effort |
| Concurrent changes to same branch | 409 | "This change conflicts with a pending update. Refresh and retry." |
| M3 analysis missing | 200 | `{ status: "no-analysis", message: "Run codebase analysis first." }` |

---

## 7. Acceptance Criteria

### Setup
- [ ] Given a project without `previewUrl`, when user opens Preview tab, then setup prompt is shown
- [ ] Given a valid HTTPS URL, when user saves preview URL, then preview API key is generated
- [ ] Given setup is complete, then script tag with project ID + API key is displayed for copying
- [ ] Given an HTTP URL, when user tries to save, then validation error is shown

### Overlay Script (on user's site)
- [ ] Given script is added to a site, when page loads, then floating toolbar appears (bottom-right)
- [ ] Given toolbar is visible, when user clicks "Annotate", then annotate mode activates (crosshair cursor, hover highlights)
- [ ] Given annotate mode is active, when user clicks an element, then text content, CSS selector, tag name, and URL are captured
- [ ] Given element is captured, then inline input panel appears asking for the desired change
- [ ] Given user submits a change, then request is sent to Maintanium API and status notification is shown
- [ ] Given invalid API key, then script shows authentication error and does not activate annotate mode

### Preview Tab (in Maintanium)
- [ ] Given preview is configured, when user opens Preview tab, then "Open Preview" button and change history are shown
- [ ] Given pending changes exist, then each change shows: summary, diff (DiffView), Apply/Dismiss buttons
- [ ] Given user clicks "Apply", then branch + commit + PR are created on GitHub
- [ ] Given PR is created, then PR URL is displayed and change status updates to "applied"
- [ ] Given user clicks "Dismiss", then change is removed from pending list

### AI Change Generation
- [ ] Given a valid change request, when AI processes it, then a diff is returned within 30 seconds
- [ ] Given the element text exists in a file, then AI finds the correct file at least 80% of the time
- [ ] Given the element text does NOT exist, then AI returns a clear "not found" message (not a hallucinated diff)

### Apply (Branch + PR)
- [ ] Given user approves a diff, when "Apply" is clicked, then a new branch is created on GitHub
- [ ] Given the branch is created, then a single commit with the change is pushed
- [ ] Given the commit succeeds, then a PR is created targeting the default branch
- [ ] Given the PR is created, then the PR URL is displayed to the user
- [ ] Given the same change is re-applied, then the existing branch/PR is updated (not duplicated)

### Security
- [ ] Preview API endpoints authenticate via project-scoped API key
- [ ] Maintanium tab endpoints require AuthGuard + `findByIdWithAuth`
- [ ] GitHub token used only for the requesting user's own repos
- [ ] Overlay script only activates on the registered preview URL origin
- [ ] No user-supplied text injected into LLM system prompts
- [ ] Preview API key is regenerable (revokes old key)

---

## 8. Open Questions / Assumptions

### RESOLVED
- ~~Overlay approach~~: **Embeddable script tag** (user adds to their project)
- ~~Preview display~~: **New tab** (user's site opens in new tab, Maintanium is the control panel)
- ~~Apply method~~: **Branch + commit + PR**
- ~~MVP scope~~: **Full loop — annotate on site, review in Maintanium, apply to GitHub**
- ~~iframe vs new tab~~: **New tab** — eliminates cross-origin issues, postMessage bridge, and X-Frame-Options blocking

### OPEN — Needs Decision

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Overlay script delivery** | (a) `<script>` tag hosted on Maintanium API, (b) npm package `@maintanium/preview`, (c) both | **(a) Script tag for MVP** — zero npm install, works with any stack. npm package can come later. |
| 2 | **Multiple changes before apply** | (a) One change at a time (apply each individually), (b) batch changes into a single PR | **(a) One at a time for MVP** — simpler state management. Batching is a natural v2 enhancement. |
| 3 | **Preview URL scope** | (a) Single URL per project, (b) multiple URLs (staging, preview, production) | **(a) Single URL for MVP** — stored in `projects.previewUrl`. Multi-URL is a v2 feature. |
| 4 | **LLM model for change generation** | (a) Same model as diagnosis agent (configurable via LLM_MODEL), (b) dedicated model config | **(a) Same model** — reuse existing ConfigService pattern. |
| 5 | **What types of changes to support?** | (a) Text/copy only, (b) text + simple styling, (c) text + styling + structural | **(b) Text + simple styling for MVP** — covers the most common "vibe coder" requests. Structural changes (move components, add sections) are complex and error-prone. |

---

## 9. New Infrastructure Required

### Database
- Add `preview_url` column to `projects` table (text, nullable)
- Add `preview_api_key` column to `projects` table (text, nullable)
- New `preview_changes` table: tracks change requests and their status

### GitHub Service Additions (3 new methods)
```
createBranch(token, owner, repo, branchName, fromSha) → ref
createOrUpdateFile(token, owner, repo, path, content, message, sha, branch) → commit
createPullRequest(token, owner, repo, title, body, head, base) → PR
```

### New Backend Module
- `PreviewModule` with `PreviewController`, `PreviewService`, `PreviewAgentService`
- Depends on: ProjectsModule, UsersModule, AuthModule, GitHubModule, AnalysisModule

### Overlay Script
- Standalone JavaScript file served from Maintanium API (e.g., `GET /preview/overlay.js`)
- Self-contained: own UI via shadow DOM, no external CSS dependencies
- Communicates with Maintanium API via `fetch()` with project-scoped API key

### Frontend
- New tab in `ProjectDetail`: "Preview"
- "Open Preview" button (opens new tab to previewUrl)
- Setup instructions component (script tag + API key display)
- Change history list with DiffView (reuse existing component)
- Apply/Dismiss buttons per change

### Two Auth Paths

| Path | Who | Auth method |
|------|-----|-------------|
| Overlay script → API | Script on user's site | `Authorization: Bearer {previewApiKey}` (project-scoped) |
| Maintanium tab → API | Authenticated user | AuthGuard + `findByIdWithAuth` (existing pattern) |

---

## 10. Estimated Scope

| Component | Effort | Notes |
|-----------|--------|-------|
| DB schema (preview_url, preview_api_key, preview_changes) | Small | 1 migration, 2 columns + 1 table |
| GitHub service additions (3 methods) | Medium | Well-documented GitHub Contents/Refs/Pulls API |
| Preview backend (module + controller + service) | Medium | Similar pattern to Issues module |
| Preview AI agent (file matching + change gen) | Medium-Large | Core intelligence — M3 + LLM |
| Overlay script (`overlay.js`) | Medium | Shadow DOM, annotate mode, element capture, API calls |
| Frontend preview tab | Small-Medium | Setup UI, change history, DiffView reuse |
| **Total** | **Medium-Large** | ~4 backend files, 1 overlay script, 2-3 frontend components |

---

## Braindump (Original — preserved for reference)

> The flow would be:
>
> User see Review/Preview tab in project details
> User opens preview in new tab (with your injected script running) or use iframe (whichever is more viable)
> User clicks the MaintainAI toolbar → enters annotate mode
> User clicks an element (say, a heading they want to reword)
> Your script captures: a screenshot of the viewport, the element's text content, and the source file path and line number from the React fiber
> User types "change this to say 'Get Started Free'"
> That payload hits your API: { screenshot, filePath: "src/components/Hero.tsx", lineNumber: 14, currentText: "Start Now", requestedChange: "Get Started Free" }
> AI opens exactly that file, finds the line, makes the change, pushes to the preview branch
> Vercel/Netlify auto-rebuilds the preview — user sees the update
>
> The hard parts to be aware of:
> The React fiber internal properties (_reactFiber, _reactInternalInstance) are undocumented and change between React versions. They work, and React DevTools relies on them too, but it's fragile. You'd need to handle React 17, 18, and 19 differently.
> This only works for React-based apps. Vue and Svelte have different internal structures. For MVP, supporting React/Next.js only covers the majority of your vibe coder market, so that's fine.
> Server components in Next.js App Router complicate things. Server-rendered HTML doesn't have React fiber nodes on the client — only client components do. For server components, you'd fall back to matching text content against the codebase via search, which is what the AI would do anyway.
> A simpler alternative that gets you 80% of the way:
> Skip the fiber-walking entirely. Your Codebase Intelligence layer (M3) already has file-level descriptions and knows which files are pages/components. When the user screenshots and describes what they want to change, send the screenshot plus the current URL path to the AI along with the codebase index. The AI uses the URL to narrow down which page component is rendering, then uses the codebase index to find the relevant file. For copy changes, a text search across the component files for the exact string shown in the screenshot will find the right file in seconds.
