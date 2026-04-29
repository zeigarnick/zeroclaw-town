# Event Agent Networking Wave 04 Execution Plan

Date: 2026-04-29
Intent: feature
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read (Wave 4 targets known event APIs, organizer controls, and legacy surfaces now visible after Waves 1-3)
External Freshness Gate: triggered (checked current Convex Rate Limiter component docs; package/config may need `@convex-dev/rate-limiter`, `convex/convex.config.ts`, and generated `components.rateLimiter`)
PRD Source: [docs/prd/event-agent-networking-prd.md](../../prd/event-agent-networking-prd.md)
Wave Source: [docs/prd/event-agent-networking-waves.json](../../prd/event-agent-networking-waves.json)

## Context

Wave 4 is the final v1 hardening pass. The event flow now has QR registration, owner card approval, event directory search, minimal connection intents, recipient filtering, contact reveal, view-only public-card map clicks, and pseudonymous match alerts.

The remaining work is to let organizers recover from abuse, apply Convex rate limits to event API surfaces, and remove or disable legacy networking surfaces that conflict with the privacy-first event model. Current legacy risks include old `/agents`, `/cards`, `/inbox`, `/meetings`, `/conversations`, and `/intros` HTTP routes, the dashboard-heavy `OwnerDashboard`, legacy match/recommendation/vector tables and functions, and NPC/random town behavior. The current worktree has unrelated local `package.json` changes and untracked `AGENTS.md`; implementers must preserve those changes when adding rate-limiter dependency/config.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-014 | Event organizer | I can pause, rotate, revoke, and review event activity. | Organizers can recover if a QR link leaks or actors abuse the event. |
| US-015 | Event organizer | Event APIs are rate-limited. | One actor cannot flood registrations, searches, updates, or connection intents. |
| US-016 | Developer | Legacy messaging, NPC, and matching paths are removed or disabled. | The shipped product no longer exposes confusing or risky old behavior. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-014 | Organizer can pause and resume event registration for a specific event. |
| AC-002 | US-014 | Organizer can rotate the event skill/QR link destination without code changes. |
| AC-003 | US-014 | Organizer can revoke/remove event agents so they disappear from directory, town projection, inbound review, and future intent creation. |
| AC-004 | US-014 | Organizer can review suspicious registrations or high-volume requesters using event-scoped counters/audit data. |
| AC-005 | US-015 | Convex Rate Limiter component protects event registration. |
| AC-006 | US-015 | Convex Rate Limiter component protects event directory search. |
| AC-007 | US-015 | Convex Rate Limiter component protects card update/owner decision paths where applicable. |
| AC-008 | US-015 | Convex Rate Limiter component protects connection-intent creation. |
| AC-009 | US-015 | Rate limit keys include event-level and agent/session/IP-derived dimensions where practical. |
| AC-010 | US-016 | Legacy free-form message, inbox, meeting, conversation, intro, and platform matching routes are removed from the public HTTP router or return explicit unsupported errors in event mode. |
| AC-011 | US-016 | Dashboard-heavy legacy UI is removed from primary navigation or replaced by event-specific surfaces. |
| AC-012 | US-016 | NPC/random town behavior is disabled for event mode, and tests/static checks prove old routes/actions are not reachable from the event path. |

## Packet Plan

### Packet 1: Organizer Event Controls

Objective: Add the minimum organizer recovery controls for leaked QR links and abusive registrations.

Covered stories: US-014
Covered acceptance criteria: AC-001, AC-002, AC-003, AC-004

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Extend `eventSpaces` and/or add `eventOrganizerAuditEvents` with fields for registration pause/resume, skill URL rotation, agent revocation, and high-volume review metadata.
- Add indexes by event ID, audit type, actor/agent, and created time.

#### [NEW] [convex/networking/eventOrganizerControls.ts](../../../../convex/networking/eventOrganizerControls.ts)

- Implement organizer mutations/queries for pause/resume registration, rotate skill URL, revoke/remove event agents, list suspicious registrations, and list high-volume requesters.
- Treat organizer auth as the existing configured/admin capability for this repo; do not invent public organizer tokens unless implementation confirms no admin surface exists.

#### [MODIFY] [convex/networking/eventAgents.ts](../../../../convex/networking/eventAgents.ts)

- Respect revoked/removed agent state in approved-card listing and owner review lookups.
- Ensure revoked agents are excluded from directory, town projection, inbound review, and new connection intents.

#### [MODIFY] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Add organizer-only event control routes or internal admin actions, depending on existing auth boundaries.
- Keep organizer routes separate from public QR/skill endpoints.

#### [NEW] [convex/networking/eventOrganizerControls.test.ts](../../../../convex/networking/eventOrganizerControls.test.ts)

- Cover pause/resume, skill URL rotation, revocation exclusion, and suspicious/high-volume review outputs.

Done definition: organizers can stop new registrations, rotate the onboarding link, revoke abusive agents, and inspect event abuse signals.

### Packet 2: Convex Rate Limiter Integration

Objective: Add component-backed rate limiting around event API surfaces.

Covered stories: US-015
Covered acceptance criteria: AC-005, AC-006, AC-007, AC-008, AC-009

#### [MODIFY] [package.json](../../../../package.json)

- Add `@convex-dev/rate-limiter` if absent. Preserve existing uncommitted `package.json` edits before modifying.

#### [MODIFY] [package-lock.json](../../../../package-lock.json)

- Update lockfile through the package manager if dependency installation is required; do not hand-edit lockfile contents.

#### [NEW] [convex/convex.config.ts](../../../../convex/convex.config.ts)

- Register the rate limiter component with `defineApp`/`use` per current Convex component docs if no component config exists.

#### [NEW] [convex/networking/eventRateLimits.ts](../../../../convex/networking/eventRateLimits.ts)

- Configure named limits for event registration, directory search, owner review/card decisions, connection intents, contact reveal, and organizer actions.
- Use event-scoped global keys and per-agent/session/requester keys where data is available.

#### [MODIFY] [convex/networking/eventAgents.ts](../../../../convex/networking/eventAgents.ts)

- Apply registration and owner-review/card-decision limits.

#### [MODIFY] [convex/networking/eventDirectory.ts](../../../../convex/networking/eventDirectory.ts)

- Apply directory search limits.

#### [MODIFY] [convex/networking/eventConnectionIntents.ts](../../../../convex/networking/eventConnectionIntents.ts)

- Apply connection-intent creation limits.

#### [MODIFY] [convex/networking/eventContactReveal.ts](../../../../convex/networking/eventContactReveal.ts)

- Apply contact reveal and recipient decision limits.

#### [NEW] [convex/networking/eventRateLimits.test.ts](../../../../convex/networking/eventRateLimits.test.ts)

- Cover successful under-limit requests and stable rate-limit errors for registration, directory, and connection intents.

Done definition: event APIs fail closed with stable rate-limit errors when limits are exceeded, and tests cover the protected surfaces.

### Packet 3: Legacy Public Surface Removal

Objective: Remove or explicitly disable old HTTP/UI surfaces that conflict with event networking.

Covered stories: US-016
Covered acceptance criteria: AC-010, AC-011

#### [MODIFY] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Remove public routing for legacy agent registration/claim, cards, inbox, meetings, conversations, and intros, or gate them behind an explicit dev-only flag if tests require temporary retention.
- Ensure event routes remain functional and still reject free-form message/contact payloads.

#### [MODIFY] [src/App.tsx](../../../../src/App.tsx)

- Remove the old `Dashboard` navigation from primary town mode or replace it with event-specific review/admin entry points.
- Keep event owner review and inbound review routes reachable.

#### [MODIFY] [src/networking/OwnerDashboard.tsx](../../../../src/networking/OwnerDashboard.tsx)

- Delete if no longer referenced, or quarantine behind a dev-only route that is not reachable in event mode.
- Do not leave meeting/conversation/intro controls visible to normal event users.

#### [MODIFY] [src/networking/api.ts](../../../../src/networking/api.ts)

- Remove legacy public client calls from normal event app paths or mark them dev-only where unavoidable for old tests.

#### [MODIFY] [convex/networking/http.test.ts](../../../../convex/networking/http.test.ts)

- Replace legacy route success assertions with unsupported/not-found assertions.
- Keep event route tests green.

Done definition: the shipped event app no longer exposes legacy free-form messaging, meetings, conversations, inbox, intros, or platform matching routes from public UI/API paths.

### Packet 4: Legacy Matching, NPC, And Vector Disablement

Objective: Disable old automated matching/NPC behavior for event mode and reduce accidental reachability.

Covered stories: US-016
Covered acceptance criteria: AC-010, AC-012

#### [MODIFY] [convex/networking/townProjection.ts](../../../../convex/networking/townProjection.ts)

- Stop projecting legacy networking relationship/status badges into event mode unless explicitly requested by a dev flag.
- Ensure event activity/counts come only from event activity tables.

#### [MODIFY] [convex/townNpcs.ts](../../../../convex/townNpcs.ts)

- Ensure random/NPC setup remains disabled by default for event mode and cannot be started through normal event setup.

#### [MODIFY] [convex/networking/matching.ts](../../../../convex/networking/matching.ts)

- Disable platform-driven/vector matching from event flows; keep legacy implementation only if isolated from event routes and dev tests.

#### [MODIFY] [convex/networking/demoSeed.ts](../../../../convex/networking/demoSeed.ts)

- Update demo seed to event-mode data or clearly quarantine old message/meeting/intro seed behind a dev-only legacy demo path.

#### [MODIFY] [public/skill.md](../../../../public/skill.md)

- Confirm no legacy route examples remain and add a short "unsupported" section for messages/meetings/conversations/intros.

#### [NEW] [convex/networking/eventLegacyRemoval.test.ts](../../../../convex/networking/eventLegacyRemoval.test.ts)

- Static/handler tests proving legacy event-incompatible routes/actions are not reachable from public event flow.

Done definition: event mode uses only event directory, connection intents, recipient review, contact reveal, and activity alerts; no NPC/vector/legacy matching behavior is active in normal event paths.

## Verification Plan

- `npm run build`: required; expected TypeScript and Vite build success. Maps to AC-001 through AC-012.
- `npm run test:networking`: required; expected all networking tests pass after route removals/rate-limit updates. Maps to AC-001 through AC-012.
- Focused tests: `eventOrganizerControls.test.ts`, `eventRateLimits.test.ts`, and `eventLegacyRemoval.test.ts`. Maps to AC-001 through AC-012.
- Browser verification with agent-browser: verify organizer pause blocks registration, QR/skill rotation updates visible onboarding link, revoked agents disappear from town/directory, event UI has no legacy dashboard/message/inbox path, and event flow still works.
- Convex log check after Convex code changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`; expected no new Convex errors.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| dependency-safety | before Packet 2 | yes | package changes needed | implementer | inspect/stage only `package.json`/lock changes made by this packet | status output |
| type-build | packet/final | yes | any TS/TSX/Convex change | implementer | `npm run build` | passing output |
| networking-tests | backend packets/final | yes | `convex/networking/*` change | implementer | `npm run test:networking` | passing output |
| route-removal-security | Packet 3/final | yes | legacy route changes | implementer | unsupported/not-found tests for legacy routes | passing tests |
| browser-e2e | final | yes | organizer controls/UI removal present | implementer with agent-browser | organizer controls + no legacy UI smoke | screenshot/log notes |
| convex-logs | final | yes | any Convex code change | implementer | log check command above | no new errors |
| tech-debt-registration | final | conditional | dev-only legacy gates retained | implementer | tracker entry or not-required statement | tracker/status |

## Risks / Out of Scope

- Installing `@convex-dev/rate-limiter` may require regenerating Convex component APIs; implementers must use the current Convex component setup and avoid hand-editing generated files.
- If legacy routes must stay for old tests, they must be dev-only and documented as temporary tech debt with tracker IDs.
- Organizer auth is not fully specified in the PRD. Use the safest existing admin/configured capability available in the repo; do not expose organizer controls through public QR routes.
- Full deletion of legacy AI Town engine chat may be too broad if core game code still needs it. Event mode only needs legacy event-incompatible behavior unreachable from public event paths.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required unless implementation retains dev-only legacy routes or compatibility flags after Wave 4. If any such gates remain, register them in [docs/exec-plans/tech-debt-tracker.md](../tech-debt-tracker.md) before completing the wave.

## Execution Checklist

- [ ] Packet 1: Organizer pause/resume, QR/skill rotation, revoke/remove, suspicious activity review.
- [ ] Packet 2: Convex Rate Limiter component install/config and event API limit enforcement.
- [ ] Packet 3: Remove or disable legacy public HTTP/UI surfaces.
- [ ] Packet 4: Disable event-incompatible legacy matching/NPC/vector behavior.
- [ ] Run build, networking tests, focused tests, browser verification, and Convex log check.
- [ ] Register tech debt if any legacy compatibility flags remain.
- [ ] Commit each discrete implementation packet atomically with explicit pathspecs.

## Discovery Summary

- `eventSpaces.registrationStatus` already exists and can support pause/resume.
- No `convex/convex.config.ts` currently exists, and no `@convex-dev/rate-limiter` references were found.
- Legacy HTTP routes for cards, inbox, meetings, conversations, and intros still exist in `convex/networking/http.ts`.
- Event activity is already display-safe and separate from contact reveal, so Wave 4 should preserve it while hardening surrounding access.
