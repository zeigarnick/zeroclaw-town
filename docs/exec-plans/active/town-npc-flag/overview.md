# Town NPC Flag Execution Plan

Intent: feature
Scale: tiny
Delivery Path: single-plan
Archetype: feature
Discovery Mode: direct-read
External Freshness Gate: not triggered (local Convex runtime behavior only)

## Context

Agora should be able to run the town without inherited AI Town random NPCs. Product matching already operates on `networkAgents` and match cards, but the default world can still be populated by `convex/init.ts` using the legacy `createAgent` input.

## User Stories

| ID | Persona | Story | Value |
| --- | --- | --- | --- |
| US-1 | Town operator | I can disable random NPCs with a flag. | The town only represents joined agents and humans. |
| US-2 | Town operator | Disabling NPCs removes existing random NPCs from the current world. | Current deployments can be corrected without recreating the world. |
| US-3 | Developer | I can re-enable NPCs for local experiments. | Legacy simulation remains available when explicitly requested. |

## Acceptance Criteria

| ID | Story | Criteria |
| --- | --- | --- |
| AC-1 | US-1 | With `AGORA_ENABLE_TOWN_NPCS` unset, `init` does not enqueue `createAgent` inputs. |
| AC-2 | US-3 | With `AGORA_ENABLE_TOWN_NPCS=true`, `init` preserves existing NPC seed behavior. |
| AC-3 | US-2 | Cleanup removes default-world agents and players not linked to `networkAgents.townPlayerId`. |
| AC-4 | US-2 | Cleanup preserves human players and networking avatars. |
| AC-5 | US-2 | Cleanup removes conversations and historical locations involving removed players. |

## Packet Plan

### Packet 1: Planning Artifact

#### [NEW] [docs/plans/2026-04-29-town-npc-flag-design.md](../../plans/2026-04-29-town-npc-flag-design.md)

- Capture the flag semantics and cleanup contract.

#### [NEW] [docs/exec-plans/active/town-npc-flag/overview.md](overview.md)

- Capture executable scope and verification gates.

### Packet 2: Runtime Flag And Cleanup

#### [MODIFY] [convex/init.ts](../../../convex/init.ts)

- Gate default `createAgent` seeding behind `AGORA_ENABLE_TOWN_NPCS`.
- Export helper(s) for deterministic tests.

#### [MODIFY] [convex/world.ts](../../../convex/world.ts)

- Add a mutation to prune inherited NPCs from the default world when the flag is disabled.
- Preserve human players and linked networking avatars.

### Packet 3: Tests And Docs

#### [NEW] [convex/init.test.ts](../../../convex/init.test.ts)

- Verify env flag parsing and default-off behavior.

#### [MODIFY] [convex/world.test.ts](../../../convex/world.test.ts)

- Verify cleanup behavior against a mixed default world.

#### [MODIFY] [docs/vercel-deployment-readiness.md](../../../docs/vercel-deployment-readiness.md)

- Document `AGORA_ENABLE_TOWN_NPCS`.

## Verification Plan

- `npm test -- --runTestsByPath convex/init.test.ts convex/world.test.ts` should pass.
- `npm run typecheck` should pass.
- `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200` should show no new Convex errors after Convex code changes.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| tests | post-implementation | yes | runtime cleanup and seed gating | current agent | `npm test -- --runTestsByPath convex/init.test.ts convex/world.test.ts` | passing output |
| typecheck | post-implementation | yes | TypeScript changes | current agent | `npm run typecheck` | passing output |
| convex-log-check | final | yes | touched `convex/` | current agent | Convex log script | no new errors |
| tech-debt-registration | planning | yes | feature flag remains intentional product config | current agent | review tracker need | not required |

## Risks / Out of Scope

- Cleanup will not delete environment variables or edit `.env` files.
- Cleanup will not remove `networkAgents`, cards, recommendations, or inbox records.
- Cleanup is scoped to the default world only.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

## Execution Checklist

- [ ] Commit planning artifacts.
- [ ] Implement flag gate and cleanup mutation.
- [ ] Add tests.
- [ ] Update deployment docs.
- [ ] Run verification.
- [ ] Commit runtime/test/docs changes.
