# Clawport Cozy Harbor Terminal Design

Date: 2026-04-29
Status: approved

## Goal

Make Clawport Terminal feel like an authored cozy harbor arrival hall instead of a plain tile-floor placeholder. The map should use all-original assets, fixed landmarks that occupy real space, and a few small ambient details.

## Direction

Clawport is a compact waterfront terminal. It should read as a warm event transit hub: blue-green harbor water, dark plank flooring, amber lamps, cargo stacks, a ticket kiosk row, rope rails, a departures board, and a docked ferry or small airship along the water edge.

The design should stay map-first. Fixed objects should shape movement and event layout rather than becoming UI chrome. The QR/event panel remains overlay UI, but the world itself should include a visible QR beacon or organizer station landmark.

## Asset Policy

All assets must be original for this project. Do not copy from a16z AI Town, OpenClaw, asset packs, mascot art, or third-party sprite sheets.

Acceptable sources:
- Locally generated pixel art committed in this repo.
- Hand-authored pixel art committed in this repo.
- Programmatically generated simple pixel assets committed in this repo.

## World Composition

- Harbor edge: water at the top with dock planks, rope rails, buoy posts, and a docked ferry or airship silhouette.
- Main floor: warm wood terminal floor with clear walkable paths.
- Left side: ticket kiosks and cargo/baggage stacks.
- Right side: departures board, organizer station, and QR beacon.
- Corners: lantern posts, crates, signage, and small decorative harbor details.

## Technical Shape

Use tile layers for floor, water, docks, walls, and simple repeated fixtures. Add support for larger fixed map sprites so landmarks can be authored as object-layer entries with:
- sprite URL
- x/y position
- width/height
- optional anchor/order fields

Collision remains tile based. Large landmarks must be paired with collision tiles or equivalent map collision data so they take up space and route movement around them.

## Acceptance

- The default `clawport-terminal` template visibly renders a cozy harbor terminal, not a generic floor pattern.
- At least four large fixed landmarks are visible in the first viewport.
- At least three landmarks have collision/blocked space in the map data.
- Assets are original and live under `public/assets/clawport-terminal/`.
- The event-world provisioning path continues to use the same `clawport-terminal` template ID.
