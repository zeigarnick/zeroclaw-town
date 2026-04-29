# Event Agent Networking Wave 03 Execution Plan

Date: 2026-04-29
Intent: feature
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read (Wave 3 was planned after Wave 2 implementation and uses the concrete connection-intent/contact/town contracts now present)
External Freshness Gate: not triggered (Wave 3 uses local Pixi/React/Convex patterns and no external service contracts)
PRD Source: [docs/prd/event-agent-networking-prd.md](../../prd/event-agent-networking-prd.md)
Wave Source: [docs/prd/event-agent-networking-waves.json](../../prd/event-agent-networking-waves.json)

## Context

Wave 2 added event directory search, minimal connection intents, recipient rules/filtering, inbound review, and contact reveal. Connection intents now use statuses such as `pending_recipient_review`, `auto_rejected`, `recipient_approved`, and `recipient_declined`; recipient approval is the public "match" moment for the big screen. Contact reveal remains private and must not drive public alerts.

The town currently projects approved event agents via `convex/networking/townProjection.ts`, builds marker positions in `src/networking/eventTownMarkers.ts`, and renders non-interactive `EventAgentMarker` graphics in `src/components/PixiGame.tsx`. Existing map clicks still support player movement for the human player. Wave 3 must make event-agent marker clicks view-only and must not create connection intents, move entities, start chat, or reveal contact fields.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-012 | Attendee | I can click an agent on the map and see its public card. | The town is useful as a browsing surface without hidden side effects. |
| US-013 | Event attendee | I can see realtime pseudonymous match activity on the big screen. | The event feels active without exposing private data. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-012 | Event-agent markers are clickable and open only that agent's public pseudonymous card. |
| AC-002 | US-012 | Event-agent marker clicks do not trigger map movement, chat, connection intent creation, matching, contact reveal, or legacy dashboard navigation. |
| AC-003 | US-012 | Public-card detail view shows randomized display name, avatar summary, role/category, offers, wants, looking-for, hobbies, interests, and favorite media only. |
| AC-004 | US-012 | Public-card detail view never shows real identity, company, email, phone, LinkedIn, X/Twitter, owner session token, contact reveal data, or event agent raw IDs. |
| AC-005 | US-013 | Recipient approval of a connection intent creates or exposes a display-safe match activity event. |
| AC-006 | US-013 | Big-screen alerts show requester and target pseudonymous names only and expire after a short duration. |
| AC-007 | US-013 | Aggregate match/activity count is visible and derived only from display-safe approved match events. |
| AC-008 | US-013 | Auto-rejected, pending, declined, and private contact-reveal events do not produce public match alerts. |

## Packet Plan

### Packet 1: Public Card Map Interaction

Objective: Make event-agent markers open a view-only public card without triggering any other map behavior.

Covered stories: US-012
Covered acceptance criteria: AC-001, AC-002, AC-003, AC-004

#### [MODIFY] [src/networking/eventTownMarkers.ts](../../../../src/networking/eventTownMarkers.ts)

- Include the event agent's display-safe public card and avatar config in `EventTownMarker`.
- Keep raw event agent IDs out of UI-facing labels where possible; use internal marker key only for React/Pixi identity.

#### [MODIFY] [src/components/PixiGame.tsx](../../../../src/components/PixiGame.tsx)

- Add pointer handling to `EventAgentMarker` that opens a public-card selection state.
- Stop propagation so marker clicks do not bubble into map movement handling.

#### [MODIFY] [src/components/Game.tsx](../../../../src/components/Game.tsx)

- Add selected event-agent public-card state and render the card panel outside the Pixi canvas.
- Ensure existing player details remain separate from event public-card details.

#### [NEW] [src/networking/EventPublicCardPanel.tsx](../../../../src/networking/EventPublicCardPanel.tsx)

- Render display name, avatar summary, and approved public-card fields only.
- Include a close action; no connect button, chat button, contact reveal, or legacy dashboard link.

#### [MODIFY] [src/networking/eventTownMarkers.test.ts](../../../../src/networking/eventTownMarkers.test.ts)

- Cover marker payload includes public-card data but not private/contact fields.

Done definition: clicking an event marker opens a public card and produces no movement/intent/chat side effects.

### Packet 2: Display-Safe Match Activity Model

Objective: Add a public activity stream for recipient-approved matches.

Covered stories: US-013
Covered acceptance criteria: AC-005, AC-007, AC-008

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `eventActivityEvents` with event ID, activity type, requester/target pseudonymous display names, source intent ID, created/updated timestamps, and display-safe payload.
- Index by event/type/created time.

#### [NEW] [convex/networking/eventActivity.ts](../../../../convex/networking/eventActivity.ts)

- Implement helpers to create and list display-safe match events.
- Return only pseudonymous names and timestamps; never include contact fields, owner session data, private rules, or raw public-card details.

#### [MODIFY] [convex/networking/eventContactReveal.ts](../../../../convex/networking/eventContactReveal.ts)

- When `decideEventConnectionIntent` approves an intent, create a `match_created` activity event.
- Do not create activity events for decline, auto-reject, contact reveal fetches, or private contact updates.

#### [NEW] [convex/networking/eventActivity.test.ts](../../../../convex/networking/eventActivity.test.ts)

- Cover activity creation on recipient approval, no activity for declined/auto-rejected intents, and no private data in activity views.

Done definition: recipient-approved connection intents create a display-safe activity event that the town can query.

### Packet 3: Big-Screen Match Alerts And Counts

Objective: Render transient match alerts and aggregate counts in town mode.

Covered stories: US-013
Covered acceptance criteria: AC-006, AC-007, AC-008

#### [MODIFY] [convex/networking/townProjection.ts](../../../../convex/networking/townProjection.ts)

- Include recent display-safe event activity and aggregate match count in `NetworkingTownProjection` when `eventId` is provided.
- Keep existing legacy relationship counts separate from event activity counts.

#### [NEW] [src/networking/EventMatchAlerts.tsx](../../../../src/networking/EventMatchAlerts.tsx)

- Render short-lived alerts such as "`Cedar Scout` matched with `Orbit Builder`" using pseudonymous names only.
- Expire alerts locally after a short duration while keeping aggregate count visible.

#### [MODIFY] [src/components/Game.tsx](../../../../src/components/Game.tsx)

- Render `EventMatchAlerts` above the town canvas using `networkingProjection` event activity data.
- Avoid overlapping the QR overlay and core controls.

#### [NEW] [src/networking/EventMatchAlerts.test.tsx](../../../../src/networking/EventMatchAlerts.test.tsx)

- Cover pseudonymous copy, count rendering, and omission of private/contact fields.

Done definition: big-screen mode shows transient pseudonymous match alerts and aggregate counts sourced from approved match activity.

## Verification Plan

- `npm run build`: required after all packets; expected TypeScript and Vite build success. Maps to AC-001 through AC-008.
- `npm run test:networking`: required after backend activity changes; expected networking tests pass. Maps to AC-005 through AC-008.
- Focused UI tests: `npm test -- src/networking/EventMatchAlerts.test.tsx src/networking/eventTownMarkers.test.ts`; expected pass. Maps to AC-001 through AC-008.
- Browser verification with agent-browser: register/approve two event agents, approve a connection intent, verify marker click opens public-card panel only, verify no movement/intent/chat side effect, and verify pseudonymous match alert/count appears.
- Convex log check after Convex code changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`; expected no new Convex errors.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| type-build | packet/final | yes | any TS/TSX/Convex change | implementer | `npm run build` | passing output |
| networking-tests | backend packets/final | yes | `convex/networking/*` change | implementer | `npm run test:networking` | passing output |
| ui-tests | UI packets/final | yes | card panel/alert changes | implementer | focused Jest tests | passing output |
| browser-e2e | final | yes | map interaction and alerts present | implementer with agent-browser | marker click + alert smoke | screenshot/log notes |
| side-effect audit | final | yes | marker click handler added | implementer | inspect/test no movement/intent/chat calls | test/evidence note |
| convex-logs | final | yes | any Convex code change | implementer | log check command above | no new errors |
| tech-debt-registration | final | conditional | temporary compatibility introduced | implementer | inspect plan/code | tracker entry or not-required statement |

## Risks / Out of Scope

- Wave 3 does not add organizer abuse controls, rate limiting, pause/rotate/revoke controls, or legacy route removal; those remain Wave 4.
- Wave 3 should not add a "connect" button to the map card. Agents still discover through the directory/API, not map clicks.
- Public match alerts are generated on recipient approval, not contact reveal retrieval.
- Existing human-player map movement may remain for legacy player avatars, but event-agent marker clicks must not trigger it.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

Wave 3 should not introduce temporary compatibility shims. Any legacy behavior still present is already owned by Wave 4.

## Execution Checklist

- [ ] Packet 1: Event marker click opens view-only public-card panel and blocks map side effects.
- [ ] Packet 2: Recipient-approved intents create display-safe match activity events.
- [ ] Packet 3: Town projection and UI render match alerts/counts.
- [ ] Run required build, networking tests, UI tests, browser verification, and Convex log check.
- [ ] Commit each discrete implementation packet atomically with explicit pathspecs.

## Discovery Summary

- `eventConnectionIntents.ts` creates intents and exposes `pending_recipient_review`, `auto_rejected`, and approved/declined status transitions through recipient decisions.
- `eventContactReveal.ts` owns recipient approval and is the right place to emit public match activity, but contact reveal contents must stay private.
- `townProjection.ts` already projects approved event agents but does not include event match activity yet.
- `PixiGame.tsx` renders event markers as non-interactive graphics today; marker clicks must stop propagation to avoid map movement.
