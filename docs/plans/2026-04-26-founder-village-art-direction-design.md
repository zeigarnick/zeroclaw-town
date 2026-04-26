# Founder Village Art Direction Design

Date: 2026-04-26

## Summary

Redesign AI Town as **Founder Village Square**: a cozy, painterly pixel-art town for builders, hackers, and VCs. The world should feel residential and social first, with credible startup rituals embedded in the environment: coffee chats, building, pitching, mentoring, async work, and small-group conversations.

The target style is a modern rustic town square with selective hacker details. It should not feel like a corporate office, a cyberpunk dashboard, or a generic fantasy RPG town.

## World Concept

Founder Village Square is a small founder village built around a central gathering square. Agents should look like they live, work, demo, wander, and meet there.

The mood is warm and credible:

- Timber, brick, stone, canvas awnings, warm windows, greenery, and soft evening light.
- Laptops on cafe tables, whiteboards outside studios, prototype benches, books, mugs, and subtle retro-computing objects.
- A few memorable landmarks that make the space easy to navigate without turning the town into a joke-heavy startup theme park.

The town should communicate builder energy through its spaces and objects, not through heavy signage or memes.

## Map Composition

The map should be organized around a central square so agents remain easy to find and the town has an obvious social center.

Core zones:

1. **Central Square**: Cobblestone or plank plaza, notice board, small fountain or fire bowl, benches, and open room for group gatherings.
2. **Founder Cafe**: Warm indoor/outdoor cafe with laptops, mugs, books, small tables, and a visible counter.
3. **Maker Garage**: Workshop with tools, prototype benches, circuit boards, half-built hardware, crates, and work lights.
4. **Demo Hall**: Small stage or projector room for pitch and demo moments.
5. **Investor Parlor**: Comfortable lounge with a long table, bookshelves, plants, and subtle finance cues.
6. **Studio Cottages**: Small founder work/live cottages around the edges, with warm windows and visible desks.
7. **Garden Paths**: Trees, planters, outdoor seating, and decompression corners.
8. **Transit Or Portal Edge**: Arrival gate, train stop, dock, or subtle portal where new agents and users enter.

The square should be visually dominant but not empty. It needs enough open walkable area for movement and enough landmarks to orient the user at default zoom.

## Art Style

Use a **painterly pixel hybrid**:

- Tile-based enough to work with the current Pixi and Tiled-style pipeline.
- Richer lighting, softer material treatment, and more bespoke landmark art than the current default pixel tiles.
- Top-down or three-quarter top-down RPG perspective.
- A 32x32 base tile grid, with larger multi-tile buildings and props.
- Readable silhouettes at game scale.

Preferred materials and details:

- Brick, timber, dark metal, stone, glass, plants, canvas awnings.
- Warm windows, lamps, string lights, small fire or fountain focal point.
- Laptops, monitors, whiteboards, sticky notes, circuit boards, old keyboards, server crates.

Avoid:

- Heavy cyberpunk.
- Neon overload.
- Fantasy castles.
- Corporate glass towers.
- Meme-heavy startup jokes.
- One-off illustrations that cannot support collision, pathing, and agent behavior.

## Character Direction

Characters should stay compatible with the current 32x32-ish spritesheet approach, but the wardrobe should shift toward founder, hacker, operator, and VC archetypes.

Useful archetypes:

- Hoodie builder with laptop bag.
- Hardware tinkerer with utility vest or tool belt.
- Casual blazer investor.
- Designer or product lead with notebook.
- Researcher with glasses, tote, or headphones.
- Operator in simple workwear.

Sprites should support four-direction walk cycles and readable idle poses. Distinct silhouettes matter more than detailed faces at game scale.

## Asset System

The redesign should be produced as a structured asset set rather than one finished background image.

Recommended asset groups:

1. **Base tileset**: Grass, paths, cobblestone, wood planks, indoor floors, water, garden edges.
2. **Building tiles and objects**: Cafe, garage, demo hall, parlor, cottages, roofs, walls, windows, doors.
3. **Props**: Benches, laptops, whiteboards, tables, mugs, books, planters, crates, tools, projector, notice board.
4. **Animated props**: Fountain or fire bowl, cafe sign, warm window flicker, server rack blink, subtle water, string lights.
5. **Character sheets**: Four-direction walk cycles matching the current animation metadata pattern.
6. **Functional layers**: Collision, spawn points, named zones, interaction hotspots, and conversation areas.

The important constraint is that visual layers and functional layers stay separate. Tiled or generated map output should include collision and semantic zones so the AI town can use the art for behavior, not just decoration.

## Production Workflow

Recommended sequence:

1. **Moodboard and spec**: Lock palette, perspective, building vocabulary, and forbidden styles.
2. **Rough map blockout**: Define the square, major buildings, paths, walkable area, and spawn points before final art.
3. **Tileset and landmark pass**: Create base tiles and the key landmarks first: cafe, garage, demo hall, investor parlor.
4. **Tiled map assembly**: Place assets in Tiled-style layers with collision and semantic zones.
5. **Character refresh**: Create new compatible character sheets after the world art is directionally right.
6. **Animated detail pass**: Add restrained movement after the static map works.
7. **In-game visual QA**: Verify readability at default zoom, pathing, occlusion, and whether agents feel socially placed.

For this repo, the first technical artifact should be an implementation plan for improving the Tiled import and conversion path around the current Pixi renderer.

## Current Repo Fit

The existing codebase already supports the right general shape:

- `src/components/PixiStaticMap.tsx` renders tile layers and animated sprites in Pixi.
- `convex/aiTown/worldMap.ts` defines the serialized world map contract.
- `data/gentle.js` is the current seeded map module.
- `data/convertMap.js` converts Tiled JSON into a map module.
- `data/characters.ts` and `data/spritesheets/*.ts` define character spritesheet metadata.

The redesign should evolve this pipeline instead of replacing Pixi or porting the project to Phaser.

## Open Decisions

- Exact palette and time of day.
- Whether the arrival edge is a train stop, dock, gate, or subtle portal.
- Whether the first map should be a compact MVP square or a larger town with edge neighborhoods.
- Whether characters are generated, hand-authored, or sourced from a consistent external sprite pack.
