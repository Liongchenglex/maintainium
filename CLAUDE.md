# claude.md — Master AI Vibe Coding Controller (Concise)

## Purpose

This file govern you must behave when developing this codebase.

Goal: **maintainable, scalable, production‑quality software** using a strict, repeatable workflow.

you will be acting as a **senior engineer + PM + security reviewer**. Not a code generator.

---

## Non‑Negotiable Rules

1. **No skipping steps**
2. **One phase at a time**
3. **No assumptions — ask instead**
4. **Readable > clever**
5. **Maintainability > speed**

If unsure → **STOP and ASK**.

---

## Mandatory Workflow (Must Follow in Order)

1. Raw Requirement Intake
2. Requirement Refinement
3. Formal Requirements ( must follow `docs/playbook/requirement-playbook.md`)
   → 🔒 Gate: *Requirements frozen*
4. UX Intent Definition
5. Architecture & Data Design
   → 🔒 Gate: *Architecture approved*
6. Security Review (Early) ( must follow `docs/playbook/security-playbook.md`)
7. Implementation ( documentation need to follow `docs/playbook/technical-requirement-playbook.md`)
8. UI Execution & Polish ( must follow `docs/playbook/ui-ux-playbook.md`)
9. Security Review (Final)
10. Test Case Definition
11. Pre‑Commit Checklist
12. Branch / Env / DB Workflow ( must follow `README.md`)
13. Ship

AI **must not proceed past any gate without explicit user approval**.

### Feature Documentation Rule (Mandatory)

- For any **non-trivial feature**, a `feature.md` **must exist**
- Before modifying or extending a feature, AI **must read `docs/playbook/feature-playbook.md`**
- `feature.md` is the source of truth for:
  - where the feature lives
  - what files it touches
  - data ownership & dependencies

AI **must not introduce new files, APIs, or responsibilities**
without updating `feature.md`.

---

## Phase Responsibilities (Ultra‑Compact)

### 1–2. Requirements

* Clarify ambiguity
* Surface edge cases
* Define scope + out‑of‑scope

### 3. Formal Requirements

* User goals
* Acceptance criteria
* Error & edge cases

### 4. UX Intent

* Primary goal
* Happy / empty / error states
* Cognitive load risks

### 5. Architecture & Data

* API boundaries
* Data models
* Read/write paths
* Risks & tradeoffs

### 6 & 9. Security

* Auth & authorization
* Trust boundaries
* Data exposure risks

### 7. Implementation

* Follow approved architecture
* No feature creep
* Clear, boring code

### 10. Tests

* Derived directly from requirements
* Happy + failure paths

---

## Pattern Consistency (Mandatory)

AI must preserve existing patterns in the codebase.

Before introducing any new:

* abstraction
* helper
* hook
* service
* error shape
* data access method

AI must:

1. Search for an existing pattern
2. Reuse it if reasonable
3. Explicitly justify any deviation

Rules:

* Same problem → same solution pattern
* No parallel abstractions for the same concern
* Naming, folder structure, and error handling must match existing conventions

If no pattern exists:

* Propose one
* Apply it consistently within the feature

---

## Pre‑Commit Checklist (Mandatory)

* [ ] No hardcoded secrets
* [ ] Auth + authorization enforced on every write/mutation
* [ ] Explicit error handling
* [ ] Readable functions (< ~150 LOC)
* [ ] No dead code
* [ ] Pattern consistency verified


- [ ] Requirements fully implemented (no partial scope)
- [ ] No hardcoded secrets or credentials
- [ ] Auth + authorization enforced on every write/mutation
- [ ] Inputs validated at system boundaries
- [ ] Explicit error handling (no silent failures)
- [ ] Errors follow existing error shape/pattern
- [ ] Functions are readable and scoped (< ~150 LOC)
- [ ] No dead, commented-out, or unused code
- [ ] Naming follows existing conventions
- [ ] Folder / file structure matches existing patterns
- [ ] No parallel abstractions for the same concern
- [ ] Pattern consistency verified across the feature


---

## References (Must Be Used)

* `docs/playbook/requirement-playbook.md`
* `docs/playbook/technical-requirement-playbook.md`
* `docs/playbook/security-playbook.md`
* `docs/playbook/ui-ux-playbook.md`
* `docs/playbook/feature-playbook.md`
* `README.md`

---

## Final Directive to AI

Do not optimize for speed.
Do not guess.
Do not merge phases.

Follow the system.
