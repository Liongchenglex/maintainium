# requirement-playbook.md — Requirement Quality Standard

## Purpose

This playbook defines **what a “good requirement” means** in this repository.

All final requirements **must be implementation‑ready**, unambiguous, and verifiable.

The output of this playbook is a **single source of truth** that engineering, AI, and future maintainers can rely on without oral context.

---

## Core Principle

> If a requirement cannot be clearly **implemented, tested, and reviewed**, it is incomplete.

No assumptions. No implied behavior. No hidden logic.

---

## Mandatory Sections for Every Final Requirement

A requirement is considered **INVALID** unless all sections below are present.

---

## 1. Context & Intent

**Purpose**: Explain *why* this feature exists.

Must include:

* User persona / system actor
* Problem being solved
* Non-goals (explicitly out of scope)

```md
### Context
Who is this for?
Why does it matter?
What is explicitly NOT included?
```

---

## 2. Actual Flow (End-to-End)

**Purpose**: Describe the full user/system journey.

Must describe the flow **from trigger to completion**, including system interactions.

```md
### Actual Flow
1. User performs action X
2. Frontend validates Y
3. API A is called
4. System processes Z
5. User receives outcome
```

No skipped steps.

---

## 3. Step-by-Step Behaviour (Deterministic)

**Purpose**: Remove ambiguity.

Must include:

* Exact order of operations
* Conditional branches
* State transitions

```md
### Step-by-Step Behaviour
- If condition A → do X
- If condition B → do Y
- Otherwise → fail with error C
```

---


## 4. Edge Cases

**Purpose**: Prevent silent failures.

Must include:

* Boundary values
* Missing data
* Duplicate actions
* Concurrency (if applicable)

```md
### Edge Cases
- Empty input
- Repeated submission
- Partial state
```

---

## 5. Failure Modes

**Purpose**: Define what “failure” looks like.

Must include:

* Validation errors
* System errors
* Auth / permission errors
* Retry behavior

```md
### Failure Scenarios
- Invalid input → 400
- Unauthorized → 401
- Forbidden → 403
- Server error → 500
```

---

## 6. Acceptance Criteria

**Purpose**: Make the requirement testable.

Each criterion must be:

* Observable
* Binary (pass/fail)

```md
### Acceptance Criteria
- Given X, when Y, then Z
- Error shown when condition A occurs
```

---

## 7. Open Questions / Assumptions (Must Be Resolved)

**Purpose**: Prevent hidden ambiguity.

```md
### Open Questions
- TBD
```

All open questions **must be resolved before implementation**.

---

## Quality Bar (Hard Rules)

A requirement **must not**:

* Rely on unstated assumptions
* Reference implementation details prematurely
* Leave behavior to “engineering discretion”

A requirement **must**:

* Be implementable without verbal clarification
* Be directly convertible into test cases

---

## Final Directive to AI

If any mandatory section is missing:

* STOP
* FLAG THE REQUIREMENT AS INCOMPLETE
* ASK FOR CLARIFICATION

Do not proceed to implementation until the requirement meets this playbook.
