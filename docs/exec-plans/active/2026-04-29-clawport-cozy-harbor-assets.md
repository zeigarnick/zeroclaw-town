# Clawport Cozy Harbor Assets Execution Plan

Date: 2026-04-29
Intent: feature
Scale: standard
Delivery Path: single-plan
Archetype: feature
Discovery Mode: direct-read (scope is the existing Clawport map, map converter, world map schema, and Pixi static renderer)
External Freshness Gate: not triggered (all assets must be original and local)
Design Source: [docs/plans/2026-04-29-clawport-cozy-harbor-design.md](../../plans/2026-04-29-clawport-cozy-harbor-design.md)

## Context

The current `clawport-terminal` template provisions correctly but renders as a plain placeholder. The user approved an all-original cozy harbor terminal with large fixed landmarks that occupy space, similar in spirit to AI Town's windmills/waterfalls but without copying any third-party assets.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-001 | Event attendee | I see a cozy harbor terminal with real landmarks. | The event world feels designed, not generic. |
| US-002 | Event organizer | Landmarks shape the floor plan. | The terminal has readable zones for onboarding and activity. |
| US-003 | Developer | I can add large original map landmarks through the map pipeline. | Future templates can use authored fixed sprites. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-001 | The rendered `clawport-terminal` map includes at least four large fixed original landmarks. |
| AC-002 | US-002 | At least three large landmarks occupy blocked map space via collision data. |
| AC-003 | US-001 | The visual direction reads as cozy harbor terminal: harbor water, dock/ferry, warm terminal floor, kiosk/cargo/board details. |
| AC-004 | US-003 | The map schema/converter/renderer can carry fixed sprite objects without breaking existing maps. |
| AC-005 | US-003 | Existing event world provisioning and template ID behavior remain unchanged. |

## Packet Plan

### Packet 1: Fixed Sprite Pipeline

Objective: Add optional large fixed sprite support from Tiled object layers through Convex map data to Pixi rendering.

Covered stories: US-003
Covered acceptance criteria: AC-004, AC-005

#### [MODIFY] [convex/aiTown/worldMap.ts](../../../../convex/aiTown/worldMap.ts)
- Add optional `fixedSprites` serialized map field with URL, position, dimensions, and layer/order fields.

#### [MODIFY] [data/convertMap.js](../../../../data/convertMap.js)
- Parse object groups with role `fixedSprites` or `fixedSprite`.
- Export `fixedSprites` and include it in `serializedWorldMap`.

#### [MODIFY] [data/convertMap.test.js](../../../../data/convertMap.test.js)
- Cover fixed sprite conversion without changing existing layer behavior.

#### [MODIFY] [src/components/PixiStaticMap.tsx](../../../../src/components/PixiStaticMap.tsx)
- Render fixed sprites below/with static map layers using nearest-neighbor textures.
- Include fixed sprites in map resync comparisons.

Done definition: existing maps still parse/render and fixed sprite conversion has focused test coverage.

### Packet 2: Cozy Harbor Clawport Map Art

Objective: Replace the plain Clawport placeholder with an original cozy harbor terminal slice.

Covered stories: US-001, US-002
Covered acceptance criteria: AC-001, AC-002, AC-003, AC-005

#### [MODIFY] [data/maps/clawport-terminal.tmj](../../../../data/maps/clawport-terminal.tmj)
- Add harbor terminal layout, fixed sprite object entries, collision around landmarks, semantic zones, and spawn points.

#### [MODIFY] [data/clawportTerminal.js](../../../../data/clawportTerminal.js)
- Regenerate from `data/convertMap.js`.

#### [MODIFY] [public/assets/clawport-terminal/clawport-terminal-tileset.png](../../../../public/assets/clawport-terminal/clawport-terminal-tileset.png)
- Expand/improve original tiles for water, planks, dock, rails, floor, and collision fixtures.

#### [NEW] [public/assets/clawport-terminal/*.png](../../../../public/assets/clawport-terminal/)
- Add original large landmark sprites such as ferry, departures board, kiosk row, crane/cargo, lantern posts, and QR beacon.

Done definition: browser smoke shows a non-plain cozy harbor terminal with visible large landmarks.

## Verification Plan

- `npm test -- data/convertMap.test.js convex/networking/eventWorldTemplates.test.ts convex/networking/eventWorlds.test.ts`: fixed converter and template provisioning checks pass.
- `npm run test:networking`: event provisioning and networking behavior remain green.
- `npm run build`: schema, generated map module, and Pixi renderer compile.
- Browser smoke on existing dev server if available: `clawport-terminal` renders visible cozy harbor landmarks with QR overlay still usable.
- Convex log check after Convex/schema changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| fixed-sprite-unit | packet/final | yes | converter/schema changes | implementer | `npm test -- data/convertMap.test.js` | passing output |
| networking-regression | final | yes | event template/provisioning path | implementer | `npm run test:networking` | passing output |
| type-build | final | yes | TS/schema/render changes | implementer | `npm run build` | passing output |
| visual-smoke | final | yes | map art changes | implementer | agent-browser screenshot if dev server exists | screenshot/render notes |
| convex-logs | final | yes | Convex code changed | implementer | log check command | no new errors |
| asset-provenance | final | yes | new art assets | implementer | inspect/source note | all-original confirmed |
| tech-debt-registration | final | conditional | temporary map fallback | implementer | tracker entry or not-required | status |

## Risks / Out of Scope

- Do not copy a16z AI Town, OpenClaw, mascot, or third-party pixel assets.
- Do not alter event networking behavior beyond map/template rendering.
- Do not touch unrelated dirty files, including existing `package.json`, `AGENTS.md`, or concurrent networking edits unless explicitly required.
- Animation can be deferred if fixed original landmarks make the map sufficiently authored.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

## Execution Checklist

- [ ] Packet 1: Add fixed sprite map pipeline and renderer support.
- [ ] Packet 2: Add original cozy harbor map art and collision.
- [ ] Regenerate `data/clawportTerminal.js`.
- [ ] Run focused tests, networking tests, build, browser smoke, and Convex log check.
- [ ] Commit each discrete change atomically with explicit pathspecs.

## Discovery Summary

- `convex/aiTown/worldMap.ts` currently supports tile layers, collision, animated sprites, spawn points, and semantic zones, but not arbitrary fixed large sprites.
- `data/convertMap.js` already parses Tiled object groups for spawn points, semantic zones, and animated sprites, making fixed sprite object parsing a small extension.
- `src/components/PixiStaticMap.tsx` renders tile layers and animated sprites, so fixed sprites can be added there without changing player or networking UI.
- `data/maps/clawport-terminal.tmj` and `data/clawportTerminal.js` already define the default event template map.
