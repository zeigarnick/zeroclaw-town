# Event World Templates Execution Plan

Date: 2026-04-29
Intent: feature
Scale: large
Delivery Path: single-plan
Archetype: feature
Discovery Mode: direct-read (current code already exposes the event tables, default world loader, map renderer, and active event networking waves)
External Freshness Gate: not triggered (implementation uses local Convex, React, Pixi, and existing map pipeline)
Design Source: [docs/plans/2026-04-29-event-world-templates-design.md](../../plans/2026-04-29-event-world-templates-design.md)

## Context

OpenNetwork is event-specific now. Event APIs are scoped by `eventId`, but the town still loads the global default AI Town `worldId`. This plan adds a durable event-world model: every event gets an internal `worldId`, selected from a reusable `worldTemplateId`, with `clawport-terminal` as the default template.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-001 | Event organizer | I can create an event with a default Clawport Terminal world. | Every event has isolated map state. |
| US-002 | Event organizer | I can choose a curated world template for an event. | Events can later differ visually without schema churn. |
| US-003 | Event attendee | I see only my event's agents and activity in the town. | Big-screen display cannot mix events. |
| US-004 | Developer | I can add future templates without rewriting event networking APIs. | Template growth stays predictable. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-001 | `eventSpaces` stores `worldTemplateId` and `worldId` for each event. |
| AC-002 | US-001 | Missing template selection defaults to `clawport-terminal`. |
| AC-003 | US-001, US-003 | Event town queries resolve the world through `eventSpaces.worldId`, not `defaultWorldStatus`. |
| AC-004 | US-002, US-004 | A typed world-template catalog maps template IDs to map modules, display names, and metadata. |
| AC-005 | US-001 | Creating an event provisions an isolated AI Town `worlds`, `worldStatus`, and `maps` row from the template. |
| AC-006 | US-003 | Town projection, QR, match alerts, and public-card map clicks stay scoped to one event/world pair. |
| AC-007 | US-004 | The Clawport Terminal template uses original assets and does not copy official OpenClaw mascot artwork. |
| AC-008 | US-001, US-002 | Tests cover default template provisioning, explicit template provisioning, and cross-event isolation. |

## Packet Plan

### Packet 1: Event World Schema And Template Catalog

Objective: Add the event-space fields and local catalog needed before any provisioning logic changes.

Covered stories: US-001, US-002, US-004
Covered acceptance criteria: AC-001, AC-002, AC-004

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `worldTemplateId` and `worldId` to `eventSpaces`.
- Preserve existing event organizer fields and indexes.

#### [NEW] [convex/networking/eventWorldTemplates.ts](../../../../convex/networking/eventWorldTemplates.ts)

- Define `clawport-terminal` as the default template.
- Map template IDs to generated map modules and display metadata.

#### [NEW] [convex/networking/eventWorldTemplates.test.ts](../../../../convex/networking/eventWorldTemplates.test.ts)

- Cover default resolution, unknown-template rejection, and catalog metadata.

Done definition: schema and catalog compile, and template resolution tests pass.

### Packet 2: Per-Event World Provisioning

Objective: Create or reuse an isolated `worldId` whenever an event space is created.

Covered stories: US-001, US-003
Covered acceptance criteria: AC-001, AC-002, AC-005, AC-008

#### [NEW] [convex/networking/eventWorlds.ts](../../../../convex/networking/eventWorlds.ts)

- Implement `getOrCreateEventWorld` using a selected template.
- Insert `worlds`, `worldStatus`, and `maps` rows from the template map module.

#### [MODIFY] [convex/networking/eventAgents.ts](../../../../convex/networking/eventAgents.ts)

- Ensure registration-created event spaces receive `worldTemplateId` and `worldId`.

#### [MODIFY] [convex/networking/eventOrganizerControls.ts](../../../../convex/networking/eventOrganizerControls.ts)

- Ensure organizer-created event spaces receive `worldTemplateId` and `worldId`.
- Keep organizer pause, rotation, and revocation behavior event-scoped.

#### [NEW] [convex/networking/eventWorlds.test.ts](../../../../convex/networking/eventWorlds.test.ts)

- Cover default Clawport provisioning, explicit template provisioning, idempotent reuse, and event isolation.

Done definition: all event creation paths attach one isolated world and map per event.

### Packet 3: Event World Loading In The Town UI

Objective: Load the event's world instead of the global default world.

Covered stories: US-003
Covered acceptance criteria: AC-003, AC-006, AC-008

#### [MODIFY] [convex/world.ts](../../../../convex/world.ts)

- Add a query that resolves event world status by `eventId`.
- Keep existing default world query for dev or legacy paths only.

#### [MODIFY] [src/components/Game.tsx](../../../../src/components/Game.tsx)

- Query event world status by `VITE_OPENNETWORK_EVENT_ID`.
- Pass the resolved `worldId` to server-game, heartbeat, projection, QR, alerts, and marker selection.

#### [MODIFY] [src/hooks/useWorldHeartbeat.ts](../../../../src/hooks/useWorldHeartbeat.ts)

- Accept an explicit `worldId` so the heartbeat keeps the event world alive.

#### [MODIFY] [src/components/PixiGame.test.ts](../../../../src/components/PixiGame.test.ts)

- Extend coverage where needed so event marker clicks remain view-only after world resolution changes.

Done definition: event town mode renders from the event world and no longer depends on `defaultWorldStatus`.

### Packet 4: Clawport Terminal Map Slice

Objective: Add the first original Clawport Terminal template map and asset bundle.

Covered stories: US-001, US-002, US-004
Covered acceptance criteria: AC-002, AC-004, AC-007

#### [NEW] [data/maps/clawport-terminal.tmj](../../../../data/maps/clawport-terminal.tmj)

- Add a small Tiled source map for the first terminal-harbor slice.
- Include event-safe zones for QR beacon, agent docks, activity board, and organizer station.

#### [NEW] [data/clawportTerminal.js](../../../../data/clawportTerminal.js)

- Commit generated map module from `data/convertMap.js`.

#### [NEW] [public/assets/clawport-terminal/clawport-terminal-tileset.png](../../../../public/assets/clawport-terminal/clawport-terminal-tileset.png)

- Add original Clawport-themed tile art sized for the existing Pixi/Tiled pipeline.

#### [MODIFY] [src/components/PixiStaticMap.tsx](../../../../src/components/PixiStaticMap.tsx)

- Register any Clawport-specific animation sheets only if the map slice needs them.

Done definition: the default template loads a Clawport Terminal map with original assets.

## Verification Plan

- `npm run build`: required after schema, Convex, React, and map changes; expected TypeScript and Vite success. Maps to AC-001 through AC-008.
- `npm run test:networking`: required after event networking changes; expected pass. Maps to AC-001 through AC-006 and AC-008.
- Focused tests: `npm test -- convex/networking/eventWorldTemplates.test.ts convex/networking/eventWorlds.test.ts`; expected pass. Maps to AC-001 through AC-005 and AC-008.
- Browser verification with agent-browser: load the event town, confirm Clawport map renders, QR/alerts/panel remain event-scoped, and a second event cannot leak agents into the first event display. Maps to AC-003, AC-006, AC-007.
- Convex log check after Convex code changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`; expected no new Convex errors.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| type-build | packet/final | yes | TS/TSX/Convex/map module changes | implementer | `npm run build` | passing output |
| networking-tests | backend packets/final | yes | `convex/networking/*` changes | implementer | `npm run test:networking` | passing output |
| map-art-provenance | Packet 4/final | yes | Clawport assets added | implementer | inspect asset source notes | original/permissive source confirmed |
| browser-e2e | final | yes | event town world loading present | implementer with agent-browser | Clawport event town smoke | screenshot/log notes |
| convex-logs | final | yes | Convex code changes | implementer | log check command above | no new errors |
| tech-debt-registration | final | conditional | temporary template fallback or legacy world path retained | implementer | tracker entry or not-required statement | tracker/status |

## Risks / Out of Scope

- Existing dirty `package.json`, `convex/convex.config.ts`, and untracked `AGENTS.md` must be preserved unless the implementer owns those changes.
- Full organizer map building is out of scope; this plan only creates the model and first curated template.
- Arbitrary organizer uploads are out of scope.
- The map must remain view-only for event-agent interactions.
- Clawport assets must be original or permissively licensed; do not copy official OpenClaw mascot artwork without rights.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

This plan should not intentionally retain temporary fallbacks. If implementation must keep a legacy shared default-world path for event mode, register that as tech debt before completion.

## Execution Checklist

- [ ] Packet 1: Add event world schema fields and template catalog.
- [ ] Packet 2: Provision isolated worlds for event spaces.
- [ ] Packet 3: Load the event world in town mode.
- [ ] Packet 4: Add the original Clawport Terminal map slice.
- [ ] Run build, networking tests, focused tests, browser verification, and Convex log check.
- [ ] Commit each discrete packet atomically with explicit pathspecs.

## Discovery Summary

- `convex/networking/schema.ts` already has `eventSpaces`, but it currently stores event metadata without a world/template link.
- `convex/init.ts` still creates one default world from a seed map and is not event-aware.
- `src/components/Game.tsx` currently reads `api.world.defaultWorldStatus` while separately using `VITE_OPENNETWORK_EVENT_ID` for event projection.
- The existing map pipeline supports generated map modules, visual layers, collision layers, spawn points, semantic zones, and Pixi-rendered tile layers.
