# Agentic Networking Full App Execution Plan

Date: 2026-04-26
Intent: feature
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read
External Freshness Gate: deferred to Packet 7 for X/Twitter verification details
Depends On: [Backend Spine Packets 1-5](overview.md)

## Context

Packets 1-5 completed the Convex backend product loop: agent registration, claim skeleton, match cards, private recommendations, mailbox meetings, async conversations, intro candidates, and product-loop tests.

The app is not yet a full working product because the previous plan intentionally deferred public HTTP routes, owner UI, town visualization, real X/Twitter verification, public agent protocol docs, production matching quality, E2E journeys, and ops hardening. This plan turns the backend spine into a usable app with a browser owner experience, agent-facing HTTP protocol, and AI Town visualization.

Key current surfaces:

- Backend functions live under `convex/networking/`.
- HTTP routes are currently only wired in `convex/http.ts`.
- Existing AI Town UI is Vite/React/Pixi under `src/`.
- Existing town engine state lives under `convex/aiTown/`, with app queries in `convex/world.ts`.
- Public static files live under `public/`.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-8 | ZeroClaw agent | I can use documented HTTP endpoints instead of importing Convex internals. | External agents can integrate with the network. |
| US-9 | Owner | I can claim, review, and manage my agent in the browser. | The system is usable by humans, not just tests. |
| US-10 | Owner | I can see cards, inbox, meetings, messages, and intro candidates in one dashboard. | Owners can supervise agent networking outcomes. |
| US-11 | Spectator/owner | I can see networking activity represented in the town. | The product feels like AI Town, not a plain admin app. |
| US-12 | Agent developer | I can read protocol docs, heartbeat instructions, and OpenAPI contract. | Integration is self-serve. |
| US-13 | Operator | I can deploy, smoke test, and monitor the networking app safely. | The feature can survive real usage. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-15 | US-8 | `/api/v1/*` HTTP routes cover registration, claim status, cards, inbox, recommendations, meetings, conversations, messages, and intro candidates with JSON errors. |
| AC-16 | US-8 | API key auth works through `Authorization: Bearer town_*`, and invalid/pending agents receive stable error responses. |
| AC-17 | US-9 | Owner claim flow no longer depends on the internal test mutation for normal UI use. |
| AC-18 | US-9 | Owner UI supports claiming an agent and seeing claim status with X/Twitter metadata. |
| AC-19 | US-10 | Owner dashboard supports cards CRUD, inbox polling, meeting request handling, conversation transcript/reply, close, and intro approve/defer/dismiss. |
| AC-20 | US-11 | Town view shows claimed networking agents, accepted meetings, conversation state, and intro-candidate state without routing core business writes through `convex/aiTown` inputs. |
| AC-21 | US-12 | `/skill.md`, `/heartbeat.md`, `/rules.md`, and `/openapi.json` describe the live protocol and match implementation behavior. |
| AC-22 | US-13 | Full E2E covers API + owner UI + town visualization from registration to intro candidate. |
| AC-23 | US-13 | Production matching uses real embedding infrastructure while tests keep deterministic scoring. |
| AC-24 | US-13 | Convex log checker mismatch is fixed or replaced, and deployment smoke checks are documented and passing. |

## Packet Plan

### Packet 6: Agent HTTP API

Objective: Expose the backend spine as a real agent-facing protocol.

Covered stories: US-8
Covered acceptance criteria: AC-15, AC-16

#### [MODIFY] [convex/http.ts](../../../../convex/http.ts)

- Add `/api/v1/*` routes while preserving `/replicate_webhook`.
- Standardize JSON success/error envelopes and CORS behavior.
- Keep route handlers thin; delegate to `convex/networking/*` handlers.

#### [NEW] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Parse bearer API keys, JSON bodies, path params, and stable Convex errors.
- Map routes for agents, cards, inbox, recommendations, meetings, conversations, messages, and intros.

#### [NEW] [convex/networking/http.test.ts](../../../../convex/networking/http.test.ts)

- Cover auth, body validation, representative success responses, and error envelopes.

#### Done Definition

- `curl` smoke test can register an agent, poll claim status, create cards, poll inbox, request/accept a meeting, send messages, close, and create an intro candidate against local Convex HTTP.
- `npm test -- convex/networking` and `npm run build` pass.

### Packet 7: Real Owner Claim Flow

Objective: Replace the normal claim path with a browser-usable owner verification flow.

Covered stories: US-9
Covered acceptance criteria: AC-17, AC-18

#### [MODIFY] [convex/networking/agents.ts](../../../../convex/networking/agents.ts)

- Add public claim-start/verify mutations for owner flow.
- Keep `claimAgentForTesting` internal and test-only.

#### [NEW] [convex/networking/ownerClaims.ts](../../../../convex/networking/ownerClaims.ts)

- Encapsulate X/Twitter verification state transitions and claim metadata updates.
- Defer external provider edge cases behind a single verification adapter.

#### [MODIFY] [docs/exec-plans/tech-debt-tracker.md](../../../tech-debt-tracker.md)

- Close `TD-AN-001` once real claim flow is the normal path.

#### Done Definition

- Browser owner can claim a registered agent without invoking internal test mutation.
- Test/dev helper still exists only for automated tests.
- Verification docs identify any X/Twitter sandbox/manual constraints.

### Packet 8: Public Agent Protocol Docs

Objective: Make the agent integration self-serve.

Covered stories: US-12
Covered acceptance criteria: AC-21

#### [NEW] [public/skill.md](../../../../public/skill.md)

- Document agent onboarding, auth, cards, inbox heartbeat, meetings, messages, and intros.

#### [NEW] [public/heartbeat.md](../../../../public/heartbeat.md)

- Provide short operational polling loop and recommended cadence.

#### [NEW] [public/rules.md](../../../../public/rules.md)

- State network norms: owner-approved content, no search/spam, respect declines, no impersonation.

#### [NEW] [public/openapi.json](../../../../public/openapi.json)

- Describe the `/api/v1/*` contract implemented in Packet 6.

#### Done Definition

- Static files are served by Vite build.
- API docs match HTTP contract tests.

### Packet 9: Owner Dashboard UI

Objective: Build the human control surface for the networking loop.

Covered stories: US-9, US-10
Covered acceptance criteria: AC-18, AC-19

#### [MODIFY] [src/App.tsx](../../../../src/App.tsx)

- Add app-level navigation between Town and Owner Dashboard without replacing the town as the primary experience.

#### [NEW] [src/networking/](../../../../src/networking)

- Add API/query hooks, state types, and components for claim status, cards, inbox, meetings, conversations, and intro candidates.

#### [NEW] [src/networking/OwnerDashboard.tsx](../../../../src/networking/OwnerDashboard.tsx)

- Dense operational UI: card table/editor, inbox list, meeting actions, transcript panel, intro review actions.
- Use restrained, professional UI; no marketing landing page.

#### Done Definition

- Browser owner can complete the core loop from dashboard using seeded/dev agents.
- UI is responsive and text does not overflow on mobile/desktop.
- Browser verification screenshots cover dashboard states.

### Packet 10: Town Visualization

Objective: Represent networking agents and state inside AI Town.

Covered stories: US-11
Covered acceptance criteria: AC-20

#### [NEW] [convex/networking/townProjection.ts](../../../../convex/networking/townProjection.ts)

- Query networking agents, active meetings, conversations, and intro candidates as visualization data.
- Do not make town movement an external agent API.

#### [MODIFY] [src/components/Game.tsx](../../../../src/components/Game.tsx)

- Fetch networking projection alongside existing world state.
- Pass networking state to Pixi and side panel components.

#### [MODIFY] [src/components/PixiGame.tsx](../../../../src/components/PixiGame.tsx)

- Render visual badges/status indicators for matched, meeting, talking, waiting, and intro-ready states.

#### [MODIFY] [src/components/PlayerDetails.tsx](../../../../src/components/PlayerDetails.tsx)

- Show networking profile/status when selected player maps to a network agent.

#### Done Definition

- Town shows claimed agents and accepted meeting/conversation activity.
- Core networking writes still go through `convex/networking/*`, not `convex/aiTown` inputs.
- Browser visual verification passes on desktop and mobile.

### Packet 11: Production Matching Quality

Objective: Move production matching off deterministic local embeddings while preserving deterministic tests.

Covered stories: US-8, US-13
Covered acceptance criteria: AC-23

#### [MODIFY] [convex/networking/matching.ts](../../../../convex/networking/matching.ts)

- Use `convex/agent/embeddingsCache.ts` or a small wrapper for production embeddings.
- Keep injectable deterministic scoring for tests.

#### [MODIFY] [convex/networking/cards.ts](../../../../convex/networking/cards.ts)

- Schedule or invoke the production embedding path without blocking user-facing mutations longer than necessary.

#### [MODIFY] [docs/exec-plans/tech-debt-tracker.md](../../../tech-debt-tracker.md)

- Close `TD-AN-002` when production uses real embedding cache.

#### Done Definition

- Production matching path uses real embeddings.
- Existing deterministic tests remain stable.
- Matching performance and error fallback behavior are documented.

### Packet 12: End-To-End Journeys

Objective: Prove the complete app works across API, UI, data, and town.

Covered stories: US-8-US-13
Covered acceptance criteria: AC-15-AC-23

#### [NEW] [e2e/networking/](../../../../e2e/networking)

- Add Playwright or repo-standard browser journeys for owner dashboard and town visualization.

#### [NEW] [scripts/networking-smoke.mjs](../../../../scripts/networking-smoke.mjs)

- Run HTTP product-loop smoke against a configured local/dev Convex endpoint.

#### [MODIFY] [package.json](../../../../package.json)

- Add focused `test:networking`, `e2e:networking`, and `smoke:networking` scripts.

#### Done Definition

- E2E registers/claims agents, creates cards, watches recommendation/inbox, accepts meeting, sends messages, closes, creates intro, and verifies town state.
- Works from a clean local setup with documented env assumptions.

### Packet 13: Deployment And Ops Hardening

Objective: Make the full app supportable after implementation.

Covered stories: US-13
Covered acceptance criteria: AC-24

#### [MODIFY] [package.json](../../../../package.json)

- Add or repair log-check script commands compatible with the installed Convex CLI.

#### [NEW] [docs/networking-ops.md](../../../networking-ops.md)

- Document env vars, local/dev/prod smoke checks, expected logs, rollback notes, and known failure modes.

#### [MODIFY] [convex/networking/*.ts](../../../../convex/networking)

- Add minimal operational logging/metrics where useful, without leaking private card/message details.

#### Done Definition

- Convex log check passes or has a repo-owned replacement.
- Deployment smoke checklist passes.
- No unresolved tech-debt tracker items remain for launch-blocking temporary mechanisms.

## Verification Plan

| Check | Command | Expected Outcome | Maps To |
|-------|---------|------------------|---------|
| Full tests | `npm test` | Existing and networking tests pass. | AC-15-AC-24 |
| Build | `npm run build` | TypeScript and Vite build pass. | AC-15-AC-24 |
| HTTP smoke | `npm run smoke:networking` | API product loop passes against configured endpoint. | AC-15, AC-16 |
| Browser E2E | `npm run e2e:networking` | Owner UI and town journeys pass. | AC-18-AC-22 |
| Visual QA | Browser screenshots desktop/mobile | Dashboard and town states render without overlap/blank canvas. | AC-19, AC-20 |
| Convex logs | repo-owned log check command | No new Convex errors after smoke/E2E. | AC-24 |

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| api-contract-review | Packet 6 | yes | HTTP route changes | implementer + oracle | route map and error envelope review | endpoint list + sample responses |
| design-review | Packets 9-10 | yes | UI/town changes | implementer + oracle | screenshots across desktop/mobile | screenshot paths + notes |
| focused-tests | every packet | yes | every packet | implementer | `npm test -- convex/networking` or focused target | passing output |
| build | every packet | yes | every packet | implementer | `npm run build` | passing output |
| browser-e2e | Packets 9-12 | yes | user-facing UI/town changes | implementer | browser/Playwright journey | pass summary + screenshots |
| smoke | Packets 6, 12, 13 | yes | HTTP/deploy changes | implementer | curl/script smoke | transcript summary |
| oracle-review | every packet | yes | before commit | oracle subagent | adversarial review | blocking findings resolved |
| tech-debt-registration | every packet | conditional | temporary rollout/mechanism remains | implementer | update tracker | tracker IDs or not required |

## Risks / Out of Scope

- Real X/Twitter integration may require provider credentials or manual sandbox steps; Packet 7 must verify current provider details before implementation.
- Existing AI Town engine errors/log noise may block reliable ops validation until Packet 13.
- Direct human outreach, email sending, LinkedIn automation, and public search remain out of scope.
- Town visualization is observational; external agents do not receive movement control.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: required (IDs: TD-AN-001, TD-AN-002)

| ID | Resolution packet |
|----|-------------------|
| TD-AN-001 | Packet 7 closes the dev/test claim-path debt before public beta. |
| TD-AN-002 | Packet 11 closes the deterministic production embedding debt before launch. |

## Execution Checklist

- [ ] Packet 6 committed: agent HTTP API.
- [ ] Packet 7 committed: real owner claim flow.
- [ ] Packet 8 committed: public agent protocol docs.
- [ ] Packet 9 committed: owner dashboard UI.
- [ ] Packet 10 committed: town visualization.
- [ ] Packet 11 committed: production matching quality.
- [ ] Packet 12 committed: E2E journeys.
- [ ] Packet 13 committed: deployment and ops hardening.
- [ ] `npm test`, `npm run build`, HTTP smoke, browser E2E, and log check pass.
- [ ] TD-AN-001 and TD-AN-002 closed or explicitly carried with launch decision.
