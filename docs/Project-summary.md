1. Executive Summary & Vision

The Problem
AI-assisted “vibe coding” tools (Bolt, Lovable, Cursor, Replit Agent) have made it possible to build web applications in hours instead of weeks. This has created an explosion of new apps and websites — but no corresponding solution for the maintenance burden that follows. Developers and non-technical founders can ship fast, but six months later they face broken dependencies, security vulnerabilities, performance degradation, and feature drift with no scalable way to manage it.

Small businesses running CMS-based sites (WordPress, Shopify, Webflow) face the same problem: ongoing maintenance is expensive, opaque, and reactive. They pay agencies or freelancers for work they can’t evaluate.

The Vision
MaintainAI is an AI-powered maintenance platform that acts as an always-on engineering team for your web applications. AI agents diagnose issues, triage incoming requests, execute fixes, monitor health, and manage upgrades — all with human-in-the-loop approval at every critical step. Every proposed fix is previewed in a live sandbox environment before it touches production.

Core Thesis
“AI made it possible to build an app in a weekend. We make sure it still works six months later.”

Target Market (Phased)
Phase 1 (Beachhead): Vibe coders, indie developers, and SMBs. Code repositories (GitHub, GitLab) and CMS platforms (WordPress, Shopify) supported from day one.
Phase 2 (Expansion): Small agencies managing portfolios of client sites. Additional CMS and ticketing integrations.
Phase 3 (Scale): Mid-market companies with legacy web applications needing ongoing support and modernisation.

2. Platform Overview & Architecture

Agent Ecosystem
The platform is composed of specialised AI agents that work together in a coordinated pipeline. Each agent has a defined scope, inputs, outputs, and escalation paths.

see agent-architecture.md

High-Level Flow
1. User connects their codebase (GitHub/GitLab) or CMS platform (WordPress/Shopify) to MaintainAI.
2. Issue enters the system via: automated scan, user highlight, or Jira/ticket integration.
3. Diagnostic Agent analyses and assigns a maintenance score (simple fix vs. new requirement).
4. BA Agent classifies: is this a code bug, a knowledge gap, or a feature request?
5. If code fix: Developer Agent generates the fix and deploys it to a sandbox preview environment.
6. User reviews the live preview side-by-side with the current production site.
7. If knowledge gap: user receives guided documentation or walkthrough.
8. If new requirement: escalated to human review with cost/effort estimate.
9. User approves or rejects at every critical decision point. Approved fixes deploy via CI/CD.
