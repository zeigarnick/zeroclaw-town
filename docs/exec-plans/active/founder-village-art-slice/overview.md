# Founder Village Cafe Art Slice Execution Plan

Date: 2026-04-26
Intent: feature
Scale: standard
Delivery Path: single-plan
Archetype: feature
Discovery Mode: direct-read (bounded vertical slice; repository context was inspected directly, and subagent burst is not authorized in this session)
External Freshness Gate: not triggered (implementation depends on local Pixi, Convex, and Tiled-style map contracts)
Design Source: [docs/plans/2026-04-26-founder-village-art-direction-design.md](../../../plans/2026-04-26-founder-village-art-direction-design.md)

## Context

AI Town currently renders a seeded Pixi tilemap from `data/gentle.js`, stores the serialized map shape in `convex/aiTown/worldMap.ts`, seeds it from `convex/init.ts`, and draws all map layers before players in `src/components/PixiStaticMap.tsx`. Characters are registered in `data/characters.ts` with Pixi-compatible spritesheet metadata in `data/spritesheets/*.ts`.

The first implementation milestone should be a final-art vertical slice centered on the **Founder Cafe**. This slice proves the redesigned visual style and the asset pipeline without waiting for a full town map.

The slice should ship as a playable in-game map segment with polished cafe/square art, collision, spawn points, semantic zones, and one animated detail. It should keep Pixi and Convex in place rather than porting to Phaser.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-1 | User | I can enter a polished Founder Cafe slice instead of the current generic town art. | The product immediately communicates the approved cozy founder-village direction. |
| US-2 | Agent | I can move around the cafe/square without walking through walls, counters, or dense props. | The final art is functional, not just decorative. |
| US-3 | Designer/developer | I can author map layers, collision, spawn points, and semantic zones in a Tiled-style source file. | Future art expansion has a repeatable pipeline. |
| US-4 | Viewer | I can see agents layer correctly around above-character objects such as signs, roofs, and tall props. | The scene feels spatial and polished at game scale. |
| US-5 | Developer | I can verify the art slice with build/test checks and a manual visual pass. | The slice is safe to keep iterating on. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-1 | US-1 | The seeded map can be switched to the Founder Cafe slice and renders the cafe/square assets in Pixi. |
| AC-2 | US-1 | The slice includes final-style art for central square ground, Founder Cafe exterior/interior cues, benches, laptop tables, planters, notice board, and one animated focal detail. |
| AC-3 | US-2 | Collision data blocks cafe walls/counter/large props while leaving the square and cafe entrance walkable. |
| AC-4 | US-3 | The converter preserves named visual layers, collision tiles, spawn points, semantic zones, above-character layers, and animated sprite references from the source map. |
| AC-5 | US-4 | Above-character layers render after players, while ground and normal object layers render before players. |
| AC-6 | US-3 | The map contract remains backward-compatible with existing seeded maps until the legacy map is intentionally removed. |
| AC-7 | US-5 | `npm run build` succeeds. |
| AC-8 | US-5 | If Convex code changes, the Convex log check runs before completion and shows no new task-related errors. |
| AC-9 | US-5 | A manual visual check confirms readable landmarks, no blank canvas, correct pathing, and no obvious sprite occlusion defects at default zoom. |

## Packet Plan

### Packet 1: Map Contract And Converter

Objective: Teach the repo to preserve the map semantics needed by final art.

Covered stories: US-2, US-3, US-4
Covered acceptance criteria: AC-3, AC-4, AC-5, AC-6

#### [MODIFY] [convex/aiTown/worldMap.ts](../../../../convex/aiTown/worldMap.ts)

- Add optional structured fields for `visualLayers`, `collisionTiles`, `aboveCharacterLayers`, `spawnPoints`, and `semanticZones`.
- Keep existing `bgTiles`, `objectTiles`, and `animatedSprites` fields so the current `gentle` map remains valid.
- Define clear serialized validators for named layer role, spawn point, and semantic zone objects.

#### [MODIFY] [data/convertMap.js](../../../../data/convertMap.js)

- Preserve Tiled layer names and roles instead of flattening every layer into anonymous arrays.
- Convert tile layers into the existing `[x][y]` tile grid shape.
- Extract object groups for spawn points, semantic zones, and animated sprite placements.
- Emit a generated JS/TS map module compatible with the expanded `WorldMap` shape.

#### Done Definition

- A small fixture `.tmj` can be converted into a map module with named layers, collision, spawn point, and semantic zone data.
- Existing `data/gentle.js` still type-checks through the expanded map contract.

### Packet 2: Pixi Layering

Objective: Render the expanded map contract with correct player occlusion.

Covered stories: US-1, US-4
Covered acceptance criteria: AC-1, AC-5, AC-6

#### [MODIFY] [src/components/PixiStaticMap.tsx](../../../../src/components/PixiStaticMap.tsx)

- Render below-character visual layers in the static map component.
- Keep animated prop support, but allow animation references from the new manifest/source map shape.
- Continue supporting legacy `bgTiles` and `objectTiles` while the new slice is introduced.

#### [MODIFY] [src/components/PixiGame.tsx](../../../../src/components/PixiGame.tsx)

- Add a render slot for above-character map layers after players.
- Keep player movement/click handling unchanged.

#### [NEW] [src/components/PixiMapLayer.tsx](../../../../src/components/PixiMapLayer.tsx)

- Factor tile-layer rendering into a reusable Pixi component if it avoids duplicating tile slicing logic.
- Use nearest-neighbor scaling and stable hit areas consistent with the existing map.

#### Done Definition

- The legacy map renders as before.
- A test or manual fixture proves above-character tiles draw over players while ground/object layers draw below players.

### Packet 3: Movement And Semantic Data

Objective: Make the final-art collision and semantic layers meaningful to gameplay.

Covered stories: US-2, US-3
Covered acceptance criteria: AC-3, AC-4, AC-6

#### [MODIFY] [convex/aiTown/movement.ts](../../../../convex/aiTown/movement.ts)

- Prefer explicit `collisionTiles` when present.
- Fall back to current `objectTiles` blocking for legacy maps.
- Keep blocked-tile behavior deterministic and tile-based.

#### [MODIFY] [convex/init.ts](../../../../convex/init.ts)

- Add a controlled map import point for the Founder Cafe slice once the generated map module exists.
- Keep the change easy to revert or switch while art iteration is active.

#### Done Definition

- Movement tests or focused runtime checks prove blocked and walkable tiles follow the source collision layer.
- The app can still initialize using the existing map if the Founder Cafe map is not selected.

### Packet 4: Founder Cafe Final-Art Slice Assets

Objective: Produce the first polished, in-game-ready Founder Village art slice.

Covered stories: US-1, US-2, US-4
Covered acceptance criteria: AC-1, AC-2, AC-3, AC-5, AC-9

#### [NEW] [public/assets/founder-village/founder-village-tileset.png](../../../../public/assets/founder-village/founder-village-tileset.png)

- Include 32x32-compatible painterly pixel tiles for square ground, paths, cafe materials, planters, tables, benches, and props.
- Keep silhouettes readable at default zoom and avoid gradients/neon-heavy styling.

#### [NEW] [public/assets/founder-village/founder-cafe-sign.png](../../../../public/assets/founder-village/founder-cafe-sign.png)

- Provide one subtle animated focal detail, such as a warm cafe sign or fire bowl.

#### [NEW] [data/maps/founder-village-cafe.tmj](../../../../data/maps/founder-village-cafe.tmj)

- Author the source map with named layers for ground, objects, above-character tiles, collision, spawn points, semantic zones, and animated props.

#### [NEW] [data/founderVillageCafe.js](../../../../data/founderVillageCafe.js)

- Generated map module produced by the converter from the `.tmj` source.
- Point tile and animation URLs at `/ai-town/assets/founder-village/...`.

#### Done Definition

- The slice contains central square ground, Founder Cafe landmark, benches, laptop tables, planters, notice board, one animated detail, collision, spawn point, and semantic zone.
- The slice renders in-game without a blank canvas or missing texture warnings.

### Packet 5: Verification And QA

Objective: Prove the art slice works technically and visually.

Covered stories: US-5
Covered acceptance criteria: AC-7, AC-8, AC-9

#### [MODIFY] [docs/exec-plans/active/founder-village-art-slice/overview.md](overview.md)

- Record final verification evidence after implementation.
- Add any follow-up tech debt only if temporary compatibility or asset placeholders remain.

#### Done Definition

- Build passes.
- Convex log check is run if Convex files changed.
- Manual visual QA records default zoom readability, pathing, collision, layering, and missing texture status.

## Verification Plan

| Check | Command / Method | Expected Outcome | AC |
|-------|------------------|------------------|----|
| Type/build | `npm run build` | TypeScript and Vite build succeed. | AC-7 |
| Focused tests | Existing movement or map tests, plus new tests if added | Collision fallback and explicit collision behavior pass. | AC-3, AC-6 |
| Converter smoke | Run converter on `data/maps/founder-village-cafe.tmj` | Generated module includes visual layers, collision, spawn point, semantic zone, and animation references. | AC-4 |
| Convex logs | `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200` | No new task-related Convex errors if Convex code changed. | AC-8 |
| Manual visual QA | Load the app without starting/restarting user-managed servers unless approved | Map is nonblank, readable, pathable, and correctly layered. | AC-1, AC-2, AC-5, AC-9 |

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| design-source-check | before implementation | yes | always | implementing agent | Compare against approved art direction doc | Plan and implementation reference Founder Village Cafe slice. |
| converter-smoke | after Packet 1 and Packet 4 | yes | converter or `.tmj` changes | implementing agent | Run converter on slice map | Generated module contains required semantic fields. |
| build | before completion | yes | always | implementing agent | `npm run build` | Passing build output. |
| convex-log-check | before completion | conditional | any `convex/` code changed | implementing agent | `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200` | No new task-related errors. |
| visual-qa | before completion | yes | map/art rendering changed | implementing agent | Browser/manual visual pass with current dev-server constraints | Notes on readability, missing textures, collision, and layering. |
| tech-debt-registration | before completion | conditional | temporary compatibility, placeholders, or deferred cleanup retained | implementing agent | Update tech-debt tracker | Tracker IDs listed below if needed. |

## Risks / Out of Scope

- Full town redesign is out of scope for this milestone.
- Character redesign is out of scope except for preserving compatibility.
- Procedural or fully AI-generated map generation is out of scope; this slice can use generated art assets, but the repo integration must be deterministic.
- Replacing Pixi with Phaser is out of scope.
- Starting or restarting dev servers is out of scope unless explicitly approved during implementation.
- Final asset quality may require iteration after the first in-game visual QA pass.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

This plan does not intentionally require temporary rollout code. If implementation keeps legacy compatibility code beyond the current map switch or ships placeholder art in the final slice, register that before completion.

## Execution Checklist

- [ ] Packet 1: Expand map contract and converter.
- [ ] Packet 2: Add Pixi below/above character layer rendering.
- [ ] Packet 3: Wire explicit collision and selectable slice initialization.
- [ ] Packet 4: Add Founder Cafe final-art slice assets and generated map module.
- [ ] Packet 5: Run build, Convex log check if required, and visual QA.
