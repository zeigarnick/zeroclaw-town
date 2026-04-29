# Event Agent Networking Wave 01 Execution Plan

Date: 2026-04-29
Intent: feature
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read (burst skipped because current runtime only allows subagents when explicitly requested)
External Freshness Gate: not triggered (Wave 01 uses local React/Vite/Pixi/Convex patterns and does not depend on third-party API changes)
PRD Source: [docs/prd/event-agent-networking-prd.md](../../prd/event-agent-networking-prd.md)
Wave Source: [docs/prd/event-agent-networking-waves.json](../../prd/event-agent-networking-waves.json)

## Context

Wave 01 covers the event onboarding foundation only: public event skill instructions, QR entry point, pseudonymous agent registration, owner-approved public card publication, and avatar configuration. The existing codebase already has legacy networking tables/functions under `convex/networking/*`, a broad owner dashboard under `src/networking/OwnerDashboard.tsx`, and a stale `public/skill.md` that still describes cards, meetings, messages, and intros.

User decision: Wave 01 should use a simpler event-session approval flow for QR onboarding, not the old X/Twitter owner-claim flow. Legacy claim, inbox, message, meeting, intro, embedding, NPC, and platform-matching paths are not removed in this wave; they are explicitly handled by later waves.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-001 | Attendee agent | I can fetch event-specific `skill.md` instructions. | Agents can register without human developer setup. |
| US-002 | Event attendee | I can scan a QR code in the town. | Event-floor onboarding is fast. |
| US-003 | Attendee agent | I can register a pseudonymous event agent. | Public presence does not expose real identity. |
| US-004 | Attendee agent | I can submit an owner-approved public networking card. | Discovery uses only approved fields. |
| US-005 | Attendee owner | I can approve the public card before search. | Agents cannot accidentally publish unapproved information. |
| US-006 | Attendee agent | I can submit an avatar config from allowed assets. | Registered agents have a visible town presence without uploads. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-001 | `public/skill.md` describes only the event QR registration, public-card approval, avatar config, and privacy rules; no meetings, conversations, messages, or intros. |
| AC-002 | US-001 | Skill instructions warn that public card text is untrusted data and no free-form agent-to-agent messages or unapproved contact fields may be sent. |
| AC-003 | US-002 | Town UI renders a persistent QR/link surface for the public skill URL without blocking core town controls. |
| AC-004 | US-002 | QR/link destination is configuration-driven, not hardcoded to a one-off deployment host. |
| AC-005 | US-003 | Event registration stores event scope, agent identifier, randomized display name, avatar config, event-session approval state, and timestamps. |
| AC-006 | US-003, US-004 | Public card validation rejects real identity/contact fields and sensitive demographic fields from public-card payloads. |
| AC-007 | US-004 | Public cards accept role/category, offers, wants, looking-for, hobbies, interests, and favorite media. |
| AC-008 | US-005 | Pending cards are not returned by public/town-facing approved-card reads until event-session owner approval. |
| AC-009 | US-005 | Owner approval UI shows exactly the public fields that will become searchable/shareable. |
| AC-010 | US-006 | Avatar config accepts only known asset IDs for hair, skin tone, clothing, hats, and accessories. |
| AC-011 | US-006 | Approved event agents can be projected into the town using pseudonymous names and avatar config. |

## Packet Plan

### Packet 1: Event Registration Schema And Validators

Objective: Add the event-specific data model and validation primitives without reusing the old claim/match-card semantics.

Covered stories: US-003, US-004, US-006
Covered acceptance criteria: AC-005, AC-006, AC-007, AC-010

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add event-specific tables such as `eventSpaces`, `eventAgents`, `eventNetworkingCards`, `eventOwnerSessions`, and `eventAvatarAssets` or equivalent fragments.
- Keep fields event-scoped and statused; do not overload legacy `networkAgents`, `ownerClaims`, or `matchCards` if that creates ambiguous behavior.

#### [MODIFY] [convex/networking/validators.ts](../../../../convex/networking/validators.ts)

- Add validators/constants for allowed public-card fields, approval statuses, avatar categories, and rejected sensitive/contact fields.
- Include stable error codes for `invalid_public_field`, `contact_field_not_public`, `sensitive_field_not_allowed`, and `invalid_avatar_asset`.

#### [MODIFY] [convex/schema.ts](../../../../convex/schema.ts)

- Ensure new event networking table fragments are included in the root schema.

#### [NEW] [convex/networking/eventCards.ts](../../../../convex/networking/eventCards.ts)

- Implement shared normalization/validation helpers for public card payloads and avatar configs.
- Return sanitized public-card views for later API/UI packets.

Done definition: schema compiles, validators reject disallowed public fields, and unit tests cover accepted/rejected card and avatar payloads.

### Packet 2: QR Skill Registration API

Objective: Expose the narrow event registration and card submission API needed by the public skill.

Covered stories: US-001, US-003, US-004, US-006
Covered acceptance criteria: AC-001, AC-002, AC-005, AC-006, AC-007, AC-010

#### [MODIFY] [public/skill.md](../../../../public/skill.md)

- Rewrite for OpenNetwork event onboarding: QR-to-skill flow, event registration, owner approval, public-card constraints, and avatar config.
- Remove instructions for meetings, inbox, conversations, messages, intros, and platform-generated matches.

#### [MODIFY] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Add event-scoped registration routes for Wave 01 while avoiding free-form message/contact payloads.
- Preserve legacy routes only where needed for existing tests until Wave 04 removal.

#### [NEW] [convex/networking/eventAgents.ts](../../../../convex/networking/eventAgents.ts)

- Implement event registration with randomized display name generation, event-session creation, and pending card state.
- Reject per-attendee-token requirements; registration should accept shared event context from the QR/skill path.

#### [NEW] [convex/networking/eventAgents.test.ts](../../../../convex/networking/eventAgents.test.ts)

- Cover registration success, event scoping, randomized display names, rejected public contact fields, and rejected sensitive fields.

Done definition: an agent can register for an event through a structured API payload, but its card remains pending until owner approval.

### Packet 3: Event Owner Approval Surface

Objective: Add the simpler event-session approval flow selected by the user.

Covered stories: US-005
Covered acceptance criteria: AC-008, AC-009

#### [MODIFY] [src/networking/api.ts](../../../../src/networking/api.ts)

- Add typed client calls for event registration lookup, pending card review, approve, reject, and request changes.
- Keep new event types separate from legacy `Agent`, `Card`, `Meeting`, `Conversation`, and `IntroCandidate` types.

#### [NEW] [src/networking/EventOwnerReview.tsx](../../../../src/networking/EventOwnerReview.tsx)

- Build compact owner approval UI that shows only public-card fields and avatar preview/config summary.
- Provide approve/reject/request-changes actions; do not show old inbox, meetings, conversations, or intros.

#### [NEW] [src/networking/EventOwnerReview.test.tsx](../../../../src/networking/EventOwnerReview.test.tsx)

- Cover pending-card rendering, approval action, and absence of private/contact fields.

#### [MODIFY] [src/App.tsx](../../../../src/App.tsx)

- Route event-session approval links to the new owner review component, not the legacy dashboard.

Done definition: owner can approve a pending event card; only approved cards can be read by public/town-facing queries.

### Packet 4: Avatar Catalog And Town Projection

Objective: Make approved event agents visible in town with allowed avatar configuration.

Covered stories: US-002, US-006
Covered acceptance criteria: AC-003, AC-004, AC-010, AC-011

#### [NEW] [src/networking/avatarCatalog.ts](../../../../src/networking/avatarCatalog.ts)

- Define the initial allowed asset IDs for hair, skin tone, clothing, hats, and accessories.
- Export shared metadata for UI previews and backend validation parity.

#### [MODIFY] [convex/networking/townProjection.ts](../../../../convex/networking/townProjection.ts)

- Add projection support for approved event agents using pseudonymous display names and avatar config.
- Do not re-enable NPC/random-agent behavior.

#### [MODIFY] [src/App.tsx](../../../../src/App.tsx)

- Add a persistent, configuration-driven QR/link overlay for the event skill URL in town mode.

#### [NEW] [src/networking/EventQrOverlay.tsx](../../../../src/networking/EventQrOverlay.tsx)

- Render the QR/link surface in a stable corner with responsive sizing and no obstruction of town controls.

Done definition: approved event agents have town projection data and town mode shows a usable QR/link entry point.

## Verification Plan

- `npm run build`: required for all packets; expected TypeScript and Vite build success. Maps to AC-001 through AC-011.
- `npm run test:networking`: required for backend packets; expected networking test suite success. Maps to AC-005 through AC-011.
- `npm test -- src/networking/EventOwnerReview.test.tsx`: required once UI tests exist; expected owner review tests pass. Maps to AC-008 and AC-009.
- Browser verification with agent-browser: required after Packet 3/4; verify QR overlay renders and owner review flow does not expose private fields. Maps to AC-003, AC-004, AC-009.
- Convex log check after Convex code changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`; expected no new Convex errors.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| type-build | packet/final | yes | any TS/TSX/Convex change | implementer | `npm run build` | passing output |
| networking-tests | backend packets/final | yes | `convex/networking/*` change | implementer | `npm run test:networking` | passing output |
| ui-tests | UI packets/final | yes | owner review component change | implementer | focused Jest component test | passing output |
| browser-e2e | final | yes | QR/owner UI present | implementer with agent-browser | town QR + owner approval smoke | screenshot/log notes |
| convex-logs | final | yes | any Convex code change | implementer | log check command above | no new errors |
| tech-debt-registration | final | conditional | temporary compatibility introduced | implementer | inspect plan/code | tracker entry or not-required statement |

## Risks / Out of Scope

- Wave 01 does not implement directory search, connection intents, recipient filters, contact reveal, organizer abuse controls, rate limiting, or legacy removal.
- Existing legacy HTTP routes for messages/meetings/intros may remain reachable until Wave 04; do not expand them.
- QR rendering may need a package choice or lightweight generated data URL during implementation; keep it local and avoid adding a large dependency without justification.
- Event-session owner approval must not become real identity verification; it is only approval of what becomes public.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

Wave 01 intentionally leaves existing legacy code in place because later PRD waves own removal. Do not add new temporary shims that require future cleanup unless a tracker entry is added before completion.

## Execution Checklist

- [ ] Packet 1: Event schema, validators, public-card sanitization, and avatar validation.
- [ ] Packet 2: Public skill rewrite and event registration API.
- [ ] Packet 3: Event-session owner approval API/client/UI.
- [ ] Packet 4: Avatar catalog, approved town projection, and QR overlay.
- [ ] Run required build, tests, browser verification, and Convex log check.
- [ ] Commit each discrete implementation packet atomically with explicit pathspecs.

## Discovery Summary

- `public/skill.md` currently documents legacy meetings, inbox, conversations, messages, and intros, so Wave 01 must rewrite it around event registration and privacy.
- `convex/networking/schema.ts` currently models legacy agents, owner claims, match cards, embeddings, recommendations, meetings, conversations, messages, and intros; Wave 01 should add event-specific tables instead of stretching these semantics.
- `src/networking/OwnerDashboard.tsx` is dashboard-heavy and tied to legacy API types; Wave 01 should add a smaller `EventOwnerReview` surface rather than modifying every legacy panel.
- `src/App.tsx` currently toggles town/dashboard and has space for town overlays; it is the likely integration point for QR and event-session review routing.
