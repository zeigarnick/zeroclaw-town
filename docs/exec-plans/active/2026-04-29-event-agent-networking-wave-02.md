# Event Agent Networking Wave 02 Execution Plan

Date: 2026-04-29
Intent: feature
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read (Wave 2 was planned after Wave 1 implementation and uses the concrete event-specific contracts now present)
External Freshness Gate: not triggered (Wave 2 uses local Convex/React HTTP patterns and does not depend on current third-party API behavior)
PRD Source: [docs/prd/event-agent-networking-prd.md](../../prd/event-agent-networking-prd.md)
Wave Source: [docs/prd/event-agent-networking-waves.json](../../prd/event-agent-networking-waves.json)

## Context

Wave 1 added event-specific registration, public-card validation, owner review sessions, town QR onboarding, avatar config, approved-card reads, and event town projection. Current core files include `convex/networking/eventAgents.ts`, `convex/networking/eventCards.ts`, event tables in `convex/networking/schema.ts`, event HTTP routes in `convex/networking/http.ts`, client types in `src/networking/api.ts`, and owner review UI in `src/networking/EventOwnerReview.tsx`.

Wave 2 must build on those event-specific tables instead of the legacy `networkAgents`, `matchCards`, `recommendations`, `meetings`, `agentConversations`, and `introCandidates` flow. The requester owner approval model is external: an attendee's own agent shows directory results to its owner in that agent session, and only after approval calls OpenNetwork. OpenNetwork should not add an outbound suggestion review UI in v1.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-007 | Attendee agent | I can search approved public event cards. | Agents can find possible matches without platform-owned matching. |
| US-008 | Attendee owner | My own agent asks me before sending a request. | Outbound requests remain human-approved without OpenNetwork owning the UI. |
| US-009 | Attendee agent | I can create a minimal connection intent. | The platform receives only requester/target IDs. |
| US-010 | Recipient owner | My rules filter requests before I see them. | Low-quality or blocked requests are reduced. |
| US-011 | Recipient owner | I can approve contact reveal. | Private contact fields stay gated until consent. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-007 | Directory API returns only approved public-card fields and pseudonymous identifiers for one event. |
| AC-002 | US-007 | Directory API supports structured filtering over role/category, offers, wants, looking-for, hobbies, interests, and favorite media without vector embeddings. |
| AC-003 | US-007 | Directory API never returns private contact fields, real names, company fields, review tokens, or owner session IDs. |
| AC-004 | US-008 | `public/skill.md` instructs agents to get owner approval externally before creating a connection intent. |
| AC-005 | US-008 | OpenNetwork adds no outbound suggestion review UI or free-form outbound message field in Wave 2. |
| AC-006 | US-009 | Connection-intent payload accepts only `requesterAgentId` and `targetAgentId`; unknown or extra fields are rejected. |
| AC-007 | US-009 | Connection-intent API verifies requester and target are approved event agents in the same event. |
| AC-008 | US-010 | Recipient rules can auto-reject an intent before recipient owner review using only the requester approved public card. |
| AC-009 | US-010 | Auto-rejected intents are auditable but not shown as active review items to the recipient owner. |
| AC-010 | US-011 | Recipient owner can approve or decline a pending inbound connection intent. |
| AC-011 | US-011 | Approved contact reveal exposes only owner-approved private contact fields and never modifies the public directory result. |

## Packet Plan

### Packet 1: Searchable Event Directory

Objective: Replace the temporary approved-card list with a structured public directory search API that agents can query directly.

Covered stories: US-007, US-008
Covered acceptance criteria: AC-001, AC-002, AC-003, AC-004

#### [NEW] [convex/networking/eventDirectory.ts](../../../../convex/networking/eventDirectory.ts)

- Implement `searchEventDirectory` over approved `eventNetworkingCards` and approved `eventAgents`.
- Support simple structured filters and text token matching across public card fields; do not use embeddings or legacy recommendations.
- Return only `EventPublicCardView`-style data plus stable pseudonymous identifiers.

#### [MODIFY] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Add `GET /api/v1/events/:eventId/directory` route with query params for supported filters.
- Keep response shape narrow and ensure review/session/private fields are never serialized.

#### [MODIFY] [src/networking/api.ts](../../../../src/networking/api.ts)

- Add `EventDirectoryResult`, `SearchEventDirectoryRequest`, and adapter method for directory search.
- Keep event API types separate from legacy cards/recommendations.

#### [MODIFY] [public/skill.md](../../../../public/skill.md)

- Document directory search examples and the external requester-owner approval rule.
- State that agents must not call the connection-intent endpoint until their owner approves a suggested target.

Done definition: approved public cards are searchable by event and no private/session/contact fields appear in directory responses.

### Packet 2: Minimal Connection Intent API

Objective: Add the core event connection-intent primitive with strict payload rejection.

Covered stories: US-008, US-009
Covered acceptance criteria: AC-005, AC-006, AC-007

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `eventConnectionIntents` with `eventId`, `requesterAgentId`, `targetAgentId`, `status`, `filterResult`, timestamps, and audit metadata.
- Add indexes by event/status, requester/status, target/status, and requester-target dedupe key.

#### [NEW] [convex/networking/eventConnectionIntents.ts](../../../../convex/networking/eventConnectionIntents.ts)

- Implement `createEventConnectionIntent` accepting only event ID, requester agent ID, and target agent ID.
- Reject requester equals target, cross-event agents, unapproved agents, duplicate active intents, and any HTTP body extra fields.
- Return status after recipient filtering, without exposing recipient private rules.

#### [MODIFY] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Add `POST /api/v1/events/:eventId/connection-intents`.
- Parse and validate exact body keys; reject `message`, `intro`, `contact`, and arbitrary payload fields.

#### [NEW] [convex/networking/eventConnectionIntents.test.ts](../../../../convex/networking/eventConnectionIntents.test.ts)

- Cover minimal payload success, extra-field rejection, cross-event rejection, pending-agent rejection, self-request rejection, and duplicate handling.

Done definition: a requester agent can create a minimal intent only after it has externally obtained owner approval; OpenNetwork stores no outbound message text.

### Packet 3: Recipient Rules And Inbound Review

Objective: Add recipient-side filtering before owner review.

Covered stories: US-010
Covered acceptance criteria: AC-008, AC-009

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `eventRecipientRules` or extend event agent/card state with owner-approved allow/block rules.
- Store explicit blocked agent IDs and public-card keyword/tag constraints; avoid sensitive-field logic.

#### [NEW] [convex/networking/eventRecipientRules.ts](../../../../convex/networking/eventRecipientRules.ts)

- Implement rule normalization and `evaluateRecipientRules` using only the requester approved public card and recipient approved rules.
- Produce auditable allow/reject reasons without exposing full private rule details to the requester.

#### [MODIFY] [convex/networking/eventConnectionIntents.ts](../../../../convex/networking/eventConnectionIntents.ts)

- Run recipient filtering synchronously during intent creation.
- Persist `auto_rejected` intents for audit and create `pending_recipient_review` only when filters allow.

#### [NEW] [src/networking/EventInboundReview.tsx](../../../../src/networking/EventInboundReview.tsx)

- Build compact recipient review UI for allowed inbound intents only.
- Show requester pseudonymous public card and approve/decline controls; do not show free-form messages.

Done definition: blocked or rule-failing requests do not appear as active inbound review items; allowed requests are reviewable by the recipient owner.

### Packet 4: Contact Reveal

Objective: Gate private contact fields behind recipient approval.

Covered stories: US-011
Covered acceptance criteria: AC-010, AC-011

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `eventPrivateContacts` for owner-approved private contact fields and `eventContactReveals` for approved reveal records.
- Keep private contact fields outside `eventNetworkingCards` and directory indexes.

#### [NEW] [convex/networking/eventContactReveal.ts](../../../../convex/networking/eventContactReveal.ts)

- Implement approve/decline recipient decision on pending intents.
- On approval, create a reveal record containing only owner-approved contact fields for the two participants.

#### [MODIFY] [convex/networking/http.ts](../../../../convex/networking/http.ts)

- Add recipient decision route such as `POST /api/v1/events/:eventId/connection-intents/:intentId/decision`.
- Return private contact data only after an approved reveal and only to participating agents/owners.

#### [MODIFY] [src/networking/api.ts](../../../../src/networking/api.ts)

- Add typed client methods and response normalizers for inbound review, decisions, and contact reveal.

Done definition: contact fields are absent from directory/search/inbound preview responses and appear only in explicit approved reveal responses.

## Verification Plan

- `npm run build`: required after all packets; expected TypeScript and Vite build success. Maps to AC-001 through AC-011.
- `npm run test:networking`: required after backend packets; expected networking tests pass. Maps to AC-001 through AC-011.
- Focused Jest tests for new files: `eventConnectionIntents.test.ts` and recipient/filter tests. Maps to AC-006 through AC-011.
- Browser verification with agent-browser after Packet 3/4: register/approve two event agents, create allowed and blocked intents, verify inbound review excludes auto-rejected requests and contact reveal stays gated.
- Convex log check after Convex code changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`; expected no new Convex errors.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| type-build | packet/final | yes | any TS/TSX/Convex change | implementer | `npm run build` | passing output |
| networking-tests | backend packets/final | yes | `convex/networking/*` change | implementer | `npm run test:networking` | passing output |
| strict-payload-security | Packet 2/final | yes | connection-intent API added | implementer | tests for extra-field rejection | passing tests |
| browser-e2e | final | yes | inbound/contact UI present | implementer with agent-browser | directory->intent->inbound review smoke | screenshot/log notes |
| convex-logs | final | yes | any Convex code change | implementer | log check command above | no new errors |
| tech-debt-registration | final | conditional | temporary compatibility introduced | implementer | inspect plan/code | tracker entry or not-required statement |

## Risks / Out of Scope

- Wave 2 does not implement big-screen match alerts or map click public-card behavior; those remain Wave 3.
- Wave 2 does not add rate limiting or organizer abuse controls; those remain Wave 4, though new APIs should be written so rate-limiter hooks are easy to add.
- Requester owner approval is external to OpenNetwork in v1. The platform cannot cryptographically prove the owner approved; it enforces the narrow API contract and documents agent obligations in `skill.md`.
- Legacy meeting/message/intro routes may still exist until Wave 4. Do not wire event flows into them.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

Wave 2 should not add intentional temporary compatibility paths. Legacy path removal remains an already-planned Wave 4 scope, not new Wave 2 debt.

## Execution Checklist

- [ ] Packet 1: Event directory query, HTTP route, client types, and skill docs.
- [ ] Packet 2: Minimal connection-intent schema, API, and strict payload tests.
- [ ] Packet 3: Recipient rules, filtering, and inbound review surface.
- [ ] Packet 4: Private contact storage, decision API, and approved reveal flow.
- [ ] Run required build, networking tests, browser verification, and Convex log check.
- [ ] Commit each discrete implementation packet atomically with explicit pathspecs.

## Discovery Summary

- Wave 1 introduced event-specific contracts in `eventAgents.ts`, `eventCards.ts`, event tables, `EventOwnerReview.tsx`, and event API types.
- `listApprovedPublicCards` currently exists but is not a structured directory search API.
- Public cards currently exclude contact fields entirely, so Wave 2 must add private contact storage separately from public cards to support contact reveal.
- Legacy networking APIs still expose messages/meetings/conversations, but Wave 2 should not extend or reuse those paths for event connection intents.
