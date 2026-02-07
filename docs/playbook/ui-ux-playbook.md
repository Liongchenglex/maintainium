> This is the **single source of truth for UI/UX decisions**.
>
> It intentionally combines:
>
> * **Hard UX guardrails** (must not be violated)
> * **Visual direction** (exploratory, allowed to evolve)
>
> This file is a **living document**. Guardrails are stable; visual design is expected to change.

---

## Part A — UX Guardrails (Non‑Negotiable)

AI **must** comply with all rules below.

### Interaction & Feedback

* One clear primary action per screen
* Loading state for every async action
* Disabled state ≠ loading state (must be visually distinct)
* No silent success or silent failure
* Destructive actions require explicit confirmation

### Errors & Empty States

* Errors must explain:

  * what happened
  * what the user can do next
* No raw system or stack errors shown to users
* Empty states must guide the user toward a next action

### Navigation & Flow

* Users must always know where they are
* Navigation must not unexpectedly reset progress
* Back actions must be predictable

### Consistency

* Same action → same UI pattern
* Same state → same visual treatment
* No “almost identical” components

---

## Part B — Responsiveness & Screen Adaptation (Non‑Negotiable)

Responsiveness is a **first‑class UX requirement**.

AI must ensure:

* UI works across common mobile screen sizes
* Content does not overflow, clip, or become unusable
* Primary actions remain reachable without awkward hand movement

Rules:

* No fixed widths that break on small screens
* Layouts must gracefully stack or reflow
* Touch targets must remain usable on all screen sizes

If a layout cannot adapt cleanly:

* AI must flag it
* Propose a responsive alternative

---

## Part C — Accessibility Baseline (Minimum)

AI must ensure:

* Text is readable without strain
* UI does not rely on color alone to convey meaning
* Interactive elements are clearly interactive

Accessibility is not optional.

---

## Part D — Visual Design Direction (Exploratory)

This section captures **current visual decisions and experiments**.

It is allowed to change frequently.

### Status

* Visual style: ❌ Not finalized
* Design system: ❌ Not finalized

AI must treat this section as **guidance, not constraint**.

---

## Current Visual Preferences (Editable)

> Fill in gradually as confidence increases.

* General vibe:
* Density (compact / balanced / spacious):
* Motion (none / subtle / expressive):
* Preferred UI references (apps / sites):

---

## Component Notes (Optional)

Use this section only when patterns emerge.

Examples:

* Buttons: (notes, not rules)
* Forms:
* Modals:

---

## Relationship to Other Docs

* UX intent per feature → `requirement.md`
* File ownership → `feature.md`
* Coding patterns → `patterns.md`

This document governs **how UI decisions are evaluated**, not how code is written.

---

## Final Directive to AI

* Guardrails in Part A–C are mandatory
* Visual direction in Part D is flexible
* If visual design conflicts with usability or responsiveness:
  **usability wins**

If uncertain:

* STOP
* ASK
