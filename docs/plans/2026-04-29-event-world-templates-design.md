# Event World Templates Design

Date: 2026-04-29
Status: Approved direction

## Context

OpenNetwork is now an event-specific networking space. Event organizers create a visual event environment, attendees scan a QR code, and attendee-owned agents register pseudonymous cards into that event. The big-screen town should be a view-only event surface: avatars, QR onboarding, aggregate activity, public-card browsing, and display-safe match alerts.

The current app still has a single default AI Town world and map. Event data is already scoped by `eventId`, but the map/simulation identity is still loaded through the default `worldId`. To support organizer-specific maps, the product needs an explicit split between event identity, reusable visual templates, and per-event world instances.

## Core Model

Use three separate identifiers:

- `eventId`: public event namespace and API scope, such as `sf-ai-summit-2026`.
- `worldTemplateId`: reusable map/art direction, such as `clawport-terminal`.
- `worldId`: internal Convex AI Town world instance for one event's running map and simulation state.

Recommended shape:

```ts
eventSpaces {
  eventId: string;
  title: string;
  worldTemplateId: string;
  worldId: Id<"worlds">;
  registrationStatus: "open" | "paused";
  skillUrl?: string;
}
```

Each event should get its own `worldId`, seeded from its selected `worldTemplateId`. This keeps organizer maps, QR placement, event activity, revocation state, and future custom layout changes isolated per event.

## Default Template

The first world template should be `clawport-terminal`.

Clawport Terminal is an OpenClaw-themed command harbor for event networking. It should feel like a surreal terminal-port where attendee agents dock, register, browse, and signal approved connections.

Visual language:

- shell terminals and command docks
- cable piers and port lanes
- glowing approval gates
- QR beacon tower
- skill docks for agent onboarding
- organizer control station
- display-safe match activity board
- map zones designed for browsing, not movement-driven gameplay

Because OpenClaw has a lobster mascot, the theme can use claw, shell, harbor, and terminal motifs. The app should use original assets inspired by the motif rather than copying any official mascot art unless the project has rights to those assets.

## Template Roadmap

Start with one curated template:

- `clawport-terminal`: default base world for all events.

Later curated templates:

- `skill-reef`: workshop-style world for agent skills and workflows.
- `approval-lagoon`: review and consent themed world for high-signal networking.
- `conference-hall`: conventional venue layout with booths, stages, and lounge zones.
- `expo-floor`: sponsor/demo-heavy event layout.

Future organizer-built worlds should come after curated templates are stable. The builder should start constrained: template selection, labels, branded signage, QR placement, zone naming, and capacity settings. Arbitrary uploads or full map editing should wait until the Tiled/LDtk import and asset validation pipeline is hardened.

## Product Behavior

Organizer flow:

1. Organizer creates or configures an event.
2. Organizer chooses a `worldTemplateId`, defaulting to `clawport-terminal`.
3. The system creates an isolated `worldId` seeded from that template.
4. The event QR/skill URL is attached to the event and rendered inside that world.
5. Approved event agents appear only in that event's world.

Attendee flow:

1. Attendee scans the event QR.
2. Attendee gives the skill URL to their agent.
3. Agent registers into the event by `eventId`.
4. Owner approves the public card.
5. Approved pseudonymous avatar appears in the event's `worldId`.
6. Map clicks show public cards only; they do not start chat, move players, create connection intents, or reveal contacts.

## Architecture Notes

`eventId` should remain the external API namespace for registration, directory search, connection intents, recipient review, contact reveal, activity, rate limits, and organizer controls.

`worldId` should remain an internal rendering/simulation identifier used by the AI Town map, Pixi rendering, heartbeat, and town projection.

`worldTemplateId` should be a stable catalog key that maps to a generated map module, asset bundle, default zones, and visual metadata.

The event projection should resolve the active world from `eventSpaces.worldId` rather than assuming `api.world.defaultWorldStatus`. This avoids cross-event display leaks and makes event resets/archive operations straightforward.

## Non-Goals

- No arbitrary organizer asset uploads in the first implementation.
- No full in-app map editor in the first implementation.
- No shared global world for multiple live events.
- No map-triggered matching, chat, or contact reveal.
- No platform-controlled matchmaking through the map.

## Success Criteria

- A new event can be associated with a dedicated `worldId`.
- A new event defaults to `clawport-terminal` when no template is specified.
- The town UI can load the event's world rather than a global default world.
- Event agents and activity render only in the event's world.
- Organizer controls operate on the event without affecting other event worlds.
- The data model can later support additional curated templates and constrained organizer customization.
