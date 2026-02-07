# technical-requirement-playbook.md — Technical Design & Implementation Standard

## Purpose

This playbook defines **how technical decisions must be made, documented, and implemented**.

Its role is to prevent:

* Ad-hoc architecture
* Inconsistent patterns
* Over‑engineering or under‑engineering
* Knowledge locked in AI or the developer’s head

This document bridges **requirements → code**.

---

## Core Principles

1. **Clarity over cleverness**
2. **Consistency over novelty**
3. **Explicit decisions over implicit assumptions**
4. **Boring is good**
5. **Optimize for future changes, not today’s shortcut**

---

## When This Playbook Applies

This playbook is mandatory for:

* Any new feature
* Any architectural change
* Any new data model
* Any new integration

It must be referenced **before implementation begins**.

---

## 1. Architecture Decisions

### Requirements

All non-trivial features must document architecture decisions.

Must include:

* Overall approach
* Alternatives considered
* Why this approach was chosen

```md
### Architecture Decision
- Chosen approach:
- Alternatives considered:
- Rationale:
```

Rules:

* Prefer existing architecture
* Avoid introducing new layers unless justified

---

## 2. System Boundaries & Responsibilities

### Requirements

Each component must have a **single clear responsibility**.

Must define:

* What this component owns
* What it explicitly does NOT own

```md
### Responsibilities
- Owns:
- Does not own:
```

Rules:

* No component should "kind of" own something

---

## 3. Data Modeling

### Requirements

Data models must be designed **before code is written**.

Must include:

* Entities
* Relationships
* Ownership
* Lifecycle (creation → update → deletion)

```md
### Data Model
Entity:
Fields:
Ownership:
Lifecycle:
```

Rules:

* Prefer fewer, stable models
* Avoid premature normalization
* Migration risk must be stated

---

## 4. API Design & Contracts

### Requirements

APIs are contracts and must be explicit.

Must include:

* Endpoint
* Method
* Auth requirements
* Request / response shape

Rules:

* Consistent naming across APIs
* Predictable error shapes
* Versioning strategy stated if relevant

---

## 5. Pattern Consistency & Reuse

### Requirements

Existing patterns must be reused.

AI must:

1. Search for similar implementations
2. Reuse the same structure
3. Justify deviations explicitly

Rules:

* Same problem → same pattern
* No duplicate abstractions

If introducing a new pattern:

* State why existing ones are insufficient
* Apply it consistently within scope

---

## 6. Error Handling Strategy

### Requirements

Error handling must be deliberate and consistent.

Must define:

* Error categories
* User-facing vs internal errors
* Retry behavior

Rules:

* No silent failures
* No leaking internal details to client

---

## 7. State Management

### Requirements

State ownership must be explicit.

Must define:

* Source of truth
* Sync strategy
* Failure recovery

Rules:

* Avoid duplicated state
* Backend is source of truth unless justified

---

## 8. Performance & Scalability Considerations

### Requirements

Performance assumptions must be stated.

Must include:

* Expected usage patterns
* Potential bottlenecks
* Mitigations

Rules:

* Avoid premature optimization
* Identify obvious N+1 or hot paths

---

## 9. Environment & Configuration

### Requirements

Environment-specific behavior must be explicit.

Must define:

* Dev vs prod differences
* Feature flags (if any)

Rules:

* No hidden environment coupling

---

## 10. Documentation Requirements

### Requirements

Non-obvious decisions must be documented.

Must include:

* Why something exists
* Why alternatives were rejected

Rules:

* Assume future readers have no context

---

## Technical Readiness Gate

Before implementation, AI must confirm:

* [ ] Architecture decisions documented
* [ ] Data model defined
* [ ] APIs specified
* [ ] Patterns identified or reused
* [ ] Error strategy defined

If any item is missing:

* STOP
* ASK FOR CLARIFICATION

---

## Final Directive to AI

If a technical decision is unclear:

* Do not guess
* Surface tradeoffs
* Ask for approval

Technical debt introduced knowingly must be **explicitly acknowledged**.
