# Agentic Networking MVP App Execution Plan

Date: 2026-04-26
Intent: feature
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read
External Freshness Gate: not triggered (MVP intentionally mocks X/Twitter claim and defers live provider integration)
Depends On: [Backend Spine Packets 1-5](overview.md)

## Context

Packets 1-5 completed the Convex backend product loop: agent registration, claim skeleton, match cards, private recommendations, mailbox meetings, async conversations, intro candidates, and product-loop tests.

The fastest useful MVP should not wait on real X/Twitter auth, production embedding quality, polished OpenAPI docs, or full ops hardening. The MVP target is a working demoable app: mock/dev claim, minimal agent HTTP API, owner dashboard, simple town status visualization, seeded/demo agents, and one end-to-end smoke journey.

Current implementation surfaces:

- Backend functions live under `convex/networking/`.
- HTTP routes are currently only wired in `convex/http.ts`.
- Existing AI Town UI is Vite/React/Pixi under `src/`.
- Existing town engine state lives under `convex/aiTown/`, with app queries in `convex/world.ts`.
- Public static files live under `public/`.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-8 | opennetwork/demo agent | I can use simple HTTP endpoints to register, claim, publish cards, poll inbox, and act on meetings/messages. | External or simulated agents can exercise the loop. |
| US-9 | Demo owner | I can mock-claim an agent in the browser without real X/Twitter auth. | The demo avoids provider setup while preserving the claim-required product shape. |
| US-10 | Demo owner | I can operate cards, inbox, meetings, messages, and intro candidates in a dashboard. | The backend becomes visible and usable. |
| US-11 | Spectator/owner | I can see networking state in the town as simple visual badges/status. | The product feels connected to AI Town. |
| US-12 | Builder/demoer | I can seed or simulate a complete two-agent loop quickly. | The app can be shown without external agents. |
| US-13 | Operator | I can run one smoke test proving the MVP path works. | The MVP has a reliable regression check. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-15 | US-8 | Minimal `/api/v1/*` routes cover registration, mock claim, cards, inbox, meeting actions, messages, close conversation, and intro candidate creation with stable JSON errors. |
| AC-16 | US-8 | API key auth works through `Authorization: Bearer town_*`; invalid or pending agents receive stable error responses. |
| AC-17 | US-9 | Mock claim accepts claim token, verification code, and owner metadata, then activates the agent without external X/Twitter calls. |
| AC-18 | US-10 | Owner dashboard can perform the full loop with claimed demo agents: cards, recommendation/inbox, meeting request/accept, message, close, intro review. |
| AC-19 | US-11 | Town renders networking agents and simple statuses for matched, meeting pending, talking, and intro ready. |
| AC-20 | US-12 | Demo seed/simulator creates a ready-to-demo scenario without manual database editing. |
| AC-21 | US-13 | One smoke/E2E command verifies API + UI + town MVP path. |
| AC-22 | US-13 | Existing `npm test` and `npm run build` remain green. |

## Packet Plan

### Packet 6: Minimal Agent API And Mock Claim

Objective: Make the backend loop accessible through a simple HTTP protocol and browser-usable mock claim.

Covered stories: US-8, US-9
Covered acceptance criteria: AC-15, AC-16, AC-17

#### [MODIFY] [convex/http.ts](../../../../convex/http.ts)

- Add `/api/v1/*` routes while preserving `/replicate_webhook`.
- Standardize JSON success/error envelopes and CORS behavior.
- Keep routes thin and delegate to `convex/networking/*` handlers.

#### [NEW] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Parse bearer API keys, JSON bodies, and path params.
- Route registration, mock claim, cards, inbox, meetings, conversations, messages, and intros.
- Return stable networking error codes as JSON.

#### [MODIFY] [convex/networking/agents.ts](../../../../convex/networking/agents.ts)

- Add a public mock/dev claim mutation or handler that uses `claimToken + verificationCode + xHandle`.
- Keep the existing internal testing helper for tests.

#### [NEW] [convex/networking/http.test.ts](../../../../convex/networking/http.test.ts)

- Cover auth parsing, mock claim success/failure, and representative route envelopes.

#### Done Definition

- `curl` can register, mock-claim, create active cards, poll inbox, request/accept meeting, send messages, close, and create intro.
- `npm test -- convex/networking` and `npm run build` pass.

### Packet 7: MVP Owner Dashboard

Objective: Provide one browser control surface for the whole backend loop.

Covered stories: US-9, US-10
Covered acceptance criteria: AC-17, AC-18

#### [MODIFY] [src/App.tsx](../../../../src/App.tsx)

- Add simple navigation between Town and Owner Dashboard.
- Keep the town visible as the primary product surface; avoid a marketing landing page.

#### [NEW] [src/networking/api.ts](../../../../src/networking/api.ts)

- Centralize Convex function calls and HTTP helpers used by dashboard components.
- Keep API state explicit and easy to seed in tests.

#### [NEW] [src/networking/OwnerDashboard.tsx](../../../../src/networking/OwnerDashboard.tsx)

- Add compact panels for mock claim, cards, inbox, meetings, conversation transcript, and intro candidates.
- Use restrained operational UI: tables/lists/forms, no decorative card nesting or gradient-heavy styling.

#### [NEW] [src/networking/OwnerDashboard.test.tsx](../../../../src/networking/OwnerDashboard.test.tsx)

- Cover core render states and action wiring where existing test setup supports it.

#### Done Definition

- Browser user can complete the backend loop from the dashboard using demo agents.
- Dashboard works at desktop and mobile widths without text overflow.
- Browser screenshots verify claim, cards, inbox, conversation, and intro states.

### Packet 8: Town MVP Projection

Objective: Show the networking loop in AI Town with lightweight visual state.

Covered stories: US-11
Covered acceptance criteria: AC-19

#### [NEW] [convex/networking/townProjection.ts](../../../../convex/networking/townProjection.ts)

- Query claimed agents, active recommendations, pending/accepted meetings, open conversations, and intro candidates.
- Return visualization-only state; do not route business writes through `convex/aiTown` inputs.

#### [MODIFY] [src/components/Game.tsx](../../../../src/components/Game.tsx)

- Fetch networking projection alongside existing world state.
- Pass networking state into Pixi and the side panel.

#### [MODIFY] [src/components/PixiGame.tsx](../../../../src/components/PixiGame.tsx)

- Render simple badges/status indicators for matched, pending meeting, talking, and intro ready.
- Avoid movement choreography for MVP.

#### [MODIFY] [src/components/PlayerDetails.tsx](../../../../src/components/PlayerDetails.tsx)

- Show selected network agent status, cards, meeting/conversation state, and intro readiness.

#### Done Definition

- Town visually reflects the seeded/demo networking state.
- No external agent movement API is introduced.
- Browser screenshot verifies nonblank Pixi canvas and visible networking status.

### Packet 9: Demo Seed And Agent Simulator

Objective: Make the app immediately demoable without external opennetwork agents.

Covered stories: US-12
Covered acceptance criteria: AC-20

#### [NEW] [convex/networking/demoSeed.ts](../../../../convex/networking/demoSeed.ts)

- Create or reset a deterministic demo scenario with two claimed agents, cards, recommendation, meeting, conversation messages, and optional intro candidate.
- Use idempotent lookup by known slugs to avoid duplicate demo data.

#### [NEW] [scripts/networking-demo.mjs](../../../../scripts/networking-demo.mjs)

- Run demo seed and print useful URLs/API keys for local manual testing.

#### [MODIFY] [package.json](../../../../package.json)

- Add `demo:networking` and `test:networking` scripts.

#### Done Definition

- One command prepares a demo state.
- Dashboard and town can show meaningful data immediately after seeding.
- Re-running seed does not create duplicate agents/cards.

### Packet 10: MVP Smoke And E2E

Objective: Prove the MVP path works across API, dashboard, and town.

Covered stories: US-8-US-13
Covered acceptance criteria: AC-15-AC-22

#### [NEW] [scripts/networking-smoke.mjs](../../../../scripts/networking-smoke.mjs)

- Run the HTTP product-loop smoke against a configured local/dev endpoint.
- Fail with clear step names and response snippets.

#### [NEW] [e2e/networking/mvp.spec.ts](../../../../e2e/networking/mvp.spec.ts)

- Browser journey: open dashboard, mock claim/demo seed, verify cards/inbox, perform meeting/message/intro actions, verify town status appears.

#### [MODIFY] [package.json](../../../../package.json)

- Add `smoke:networking` and `e2e:networking`.

#### Done Definition

- `npm test`, `npm run build`, `npm run smoke:networking`, and `npm run e2e:networking` pass in the documented local setup.
- The app can be opened and demoed without external services.

## Verification Plan

| Check | Command | Expected Outcome | Maps To |
|-------|---------|------------------|---------|
| Networking tests | `npm test -- convex/networking` | Backend/API focused tests pass. | AC-15-AC-18 |
| Full tests | `npm test` | Existing and networking tests pass. | AC-15-AC-22 |
| Build | `npm run build` | TypeScript and Vite build pass. | AC-15-AC-22 |
| Demo seed | `npm run demo:networking` | Idempotent demo data created and URLs/keys printed. | AC-20 |
| HTTP smoke | `npm run smoke:networking` | Product loop passes via HTTP. | AC-15, AC-16, AC-21 |
| Browser E2E | `npm run e2e:networking` | Dashboard and town MVP journey passes. | AC-18, AC-19, AC-21 |
| Visual QA | Browser screenshots desktop/mobile | Dashboard and town states render without overlap/blank canvas. | AC-18, AC-19 |

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| api-contract-review | Packet 6 | yes | HTTP route changes | implementer + oracle | endpoint map and error envelope review | sample request/response summary |
| focused-tests | every packet | yes | every packet | implementer | focused Jest target or `npm test -- convex/networking` | passing output |
| build | every packet | yes | every packet | implementer | `npm run build` | passing output |
| browser-visual | Packets 7-8 | yes | dashboard/town UI changes | implementer | browser screenshots desktop/mobile | screenshot notes |
| smoke | Packets 6, 10 | yes | HTTP or E2E changes | implementer | curl/script smoke | transcript summary |
| oracle-review | every packet | yes | before commit | oracle subagent | adversarial review | blocking findings resolved |
| tech-debt-registration | every packet | conditional | temporary mechanism remains | implementer | update tracker | tracker IDs or not required |

## Risks / Out of Scope

- Real X/Twitter verification is out of MVP scope; mock claim is intentional.
- Production embedding quality is out of MVP scope; deterministic/current matching can remain for demo.
- Rich OpenAPI docs, complete public protocol docs, deployment hardening, and production monitoring are deferred.
- Direct human outreach, email sending, LinkedIn automation, public search, and autonomous town movement choreography are out of scope.
- Existing AI Town engine/log noise may still affect ops checks; MVP verification focuses on tests, build, smoke, E2E, and screenshots.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: required (IDs: TD-AN-001, TD-AN-002)

| ID | Why carried through MVP | Post-MVP resolution |
|----|-------------------------|---------------------|
| TD-AN-001 | Mock claim is the fastest path to a working demo. | Replace with real X/Twitter verification before public beta. |
| TD-AN-002 | Current matching is enough for demo and stable tests. | Move production matching to real embedding cache before launch. |

Post-MVP backlog:

- Real X/Twitter claim/OAuth or tweet verification.
- Full `/skill.md`, `/heartbeat.md`, `/rules.md`, and `/openapi.json`.
- Production embedding path and matching refresh jobs.
- Deployment/ops hardening and Convex log-checker replacement.
- Rich owner review console and town movement choreography.

## Execution Checklist

- [ ] Packet 6 committed: minimal agent API and mock claim.
- [ ] Packet 7 committed: MVP owner dashboard.
- [ ] Packet 8 committed: town MVP projection.
- [ ] Packet 9 committed: demo seed and agent simulator.
- [ ] Packet 10 committed: MVP smoke and E2E.
- [ ] `npm test`, `npm run build`, `npm run demo:networking`, `npm run smoke:networking`, and `npm run e2e:networking` pass.
- [ ] TD-AN-001 and TD-AN-002 remain explicitly tracked as post-MVP debt.
