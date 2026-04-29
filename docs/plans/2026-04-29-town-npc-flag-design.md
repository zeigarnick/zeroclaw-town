# Town NPC Flag Design

Date: 2026-04-29

## Context

Agora has two agent concepts:

- `networkAgents`: claimed/joined product agents that own match cards and participate in the networking match loop.
- AI Town NPC agents: inherited world simulation characters seeded from `data/characters` through `convex/init.ts` and `createAgent`.

Networking matches already use `networkAgents` and active `matchCards`, so random NPCs do not need to be removed from matching logic. The requested behavior is town-level: when NPCs are disabled, the visible/default world should only contain joined networking agents and human player sessions.

## Decision

Add a Convex environment flag named `AGORA_ENABLE_TOWN_NPCS`.

- Default: disabled.
- Enabled values: `1`, `true`, `yes`, or `on`.
- Disabled behavior: `convex/init.ts` creates the default world and map but does not enqueue inherited `createAgent` NPC inputs.
- Enabled behavior: existing AI Town NPC seeding remains available for local experiments.

Turning NPCs off should also remove existing inherited NPC agents from the current default world. This cleanup should run explicitly through a Convex mutation instead of silently deleting world state during ordinary initialization.

## Runtime Cleanup Rule

The cleanup preserves:

- Human players with `player.human` session identifiers.
- Players linked from active or previously linked `networkAgents.townPlayerId`.
- Agent records whose `playerId` is linked to a `networkAgent`.

The cleanup removes:

- AI Town agent records whose `playerId` is not linked to any `networkAgent`.
- Their associated player rows.
- Conversations involving removed players.
- Historical locations for removed players.

## Acceptance

- With `AGORA_ENABLE_TOWN_NPCS` unset, default init does not create random AI Town NPCs.
- With `AGORA_ENABLE_TOWN_NPCS=true`, init can still seed the inherited NPC set.
- Running cleanup while NPCs are disabled removes existing random NPCs from the default world.
- Cleanup does not remove claimed networking avatars or human sessions.
- Tests cover seed gating and cleanup preservation/removal rules.
