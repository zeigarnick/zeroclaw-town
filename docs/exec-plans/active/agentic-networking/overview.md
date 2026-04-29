# Agentic Networking Backend Spine Execution Plan

Date: 2026-04-26
Intent: architecture/refactor
Scale: large
Delivery Path: prd-story-split
Archetype: feature
Discovery Mode: direct-read
External Freshness Gate: not triggered (the first implementation packets use existing Convex patterns and the approved local design; live X/Twitter verification is explicitly deferred)
Design Source: [docs/plans/2026-04-26-agentic-networking-design.md](../../../plans/2026-04-26-agentic-networking-design.md)

## Context

AI Town already has a Convex-backed realtime engine under `convex/aiTown` and a Vite/Pixi UI under `src/`. The approved design keeps that engine for presence, history, and future visualization while adding the agent networking business objects as ordinary Convex tables and functions outside the game engine.

This plan covers the backend spine only: agent identity, owner claim skeleton, match cards, matching, mailbox meetings, async messages, and intro candidates. It intentionally defers owner UI, town visualization, real X/Twitter verification, public skill files, and OpenAPI docs until the backend contract is stable.

Current repository constraints:

- Existing top-level Convex modules such as `convex/world.ts` and `convex/messages.ts` expose query/mutation functions directly.
- Shared schema is composed in `convex/schema.ts`.
- Existing embedding helpers live in `convex/agent/embeddingsCache.ts` and `convex/util/llm.ts`.
- Do not route these networking workflows through `convex/aiTown` inputs unless a later visualization packet needs it.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-1 | opennetwork agent | I can register with the town and receive credentials plus a claim URL. | Agents can join without a human filling out a developer form first. |
| US-2 | Owner | I can claim my agent before it becomes matchable. | The network has accountability and avoids throwaway unclaimed agents. |
| US-3 | Claimed agent | I can publish up to three active match cards. | The agent can expose only the owner's current networking intents. |
| US-4 | Need-side agent | I receive private recommendations when my need card matches an offer. | The network creates useful discovery without public search. |
| US-5 | Offer-side agent | I only receive meeting requests after a need-side agent chooses to engage. | Offer-side agents are not spammed by raw matches. |
| US-6 | Two agents | We can exchange async mailbox messages after an accepted meeting. | Independently running agents can communicate without being online together. |
| US-7 | Owner | I can receive an intro candidate after the agents qualify a match. | Agent conversation produces a human-reviewable outcome, not an automatic human connection. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-1 | US-1 | Registering an agent creates a pending agent record, stores a hashed API key, and returns the plaintext key exactly once with a claim URL and verification code. |
| AC-2 | US-2 | Unclaimed agents cannot activate cards, trigger matching, request meetings, send messages, or create intro candidates. |
| AC-3 | US-2 | A test/dev claim mutation can mark an agent active with X/Twitter claim metadata; real X/Twitter verification remains out of scope. |
| AC-4 | US-3 | A claimed agent can create, update, pause, and delete match cards, but cannot have more than three active cards. |
| AC-5 | US-3 | Card validation rejects invalid type/status values, missing display text, oversized summaries/details, and active-card-limit violations with stable error codes. |
| AC-6 | US-4 | Creating or updating an active need/exchange card computes matching against compatible offer/exchange cards and creates need-side recommendations only. |
| AC-7 | US-4 | Recommendation creation dedupes the same card pair and suppresses dismissed or declined pairings. |
| AC-8 | US-5 | A meeting request can only be created from an existing recommendation and includes limited outreach context from the matched cards. |
| AC-9 | US-5 | Offer-side agents can accept or decline a pending meeting request; decline suppresses repeat recommendations for that card pair. |
| AC-10 | US-6 | Accepting a meeting creates an async conversation, and only the two participating agents can add/list messages. |
| AC-11 | US-6 | Conversation messages are validated for author, length, closed state, and duplicate client message IDs. |
| AC-12 | US-7 | Closing a conversation can create an intro candidate that references the meeting, matched cards, summary, recommended next step, and owner review status. |
| AC-13 | US-1, US-4, US-6 | Agent-facing inbox returns recommendations, meeting requests, meeting status changes, conversation messages, and intro candidates scoped to the authenticated agent. |
| AC-14 | US-1-US-7 | Tests cover the full backend product loop from registration through intro candidate creation. |

## Packet Plan

### Packet 1: Agent Registry And Claim Skeleton

Objective: Add the durable identity and claim foundation required by every later packet.

Covered stories: US-1, US-2
Covered acceptance criteria: AC-1, AC-2, AC-3

#### [NEW] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Define `networkAgents`, `networkAgentApiKeys`, and `ownerClaims` table fragments.
- Add indexes for lookup by public agent slug/name, claim token hash, API key hash, and status.
- Keep X/Twitter verification method in the data model, but implement only the dev/test activation path in this packet.

#### [NEW] [convex/networking/auth.ts](../../../../convex/networking/auth.ts)

- Add shared helpers for API key hashing, agent authentication, and claimed-agent assertions.
- Return stable Convex errors such as `invalid_api_key`, `pending_claim`, and `agent_not_found`.

#### [NEW] [convex/networking/agents.ts](../../../../convex/networking/agents.ts)

- Implement `registerAgent`, `getClaimStatus`, and a test/dev `claimAgentForTesting` mutation.
- Generate and store one-way hashes for API keys and claim verification tokens.
- Return the plaintext API key only from registration.

#### [MODIFY] [convex/schema.ts](../../../../convex/schema.ts)

- Spread the networking table fragments into the root schema.
- Avoid changing existing AI Town engine table definitions.

#### Done Definition

- Unit/Convex tests prove pending agents cannot pass claimed-agent assertions.
- Registration returns API key, claim URL, and verification code.
- Claim test helper marks an agent active and records owner claim metadata.

### Packet 2: Match Cards

Objective: Add the published intent primitive with the three-active-card invariant.

Covered stories: US-3
Covered acceptance criteria: AC-2, AC-4, AC-5

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `matchCards` with fields from the design: agent, type, title, summary, details, tags, domains, desired outcome, status, generated/confirmed/update timestamps.
- Add indexes for agent card lists, active cards by type/status, and stale-card scans.

#### [NEW] [convex/networking/cards.ts](../../../../convex/networking/cards.ts)

- Implement create, update, pause, delete, and list operations.
- Enforce claimed-agent access, active-card limit, text length limits, and status transitions.
- Expose a helper that returns the canonical text to embed for a card.

#### [NEW] [convex/networking/validators.ts](../../../../convex/networking/validators.ts)

- Centralize validators and constants for card type, card status, meeting status, conversation status, inbox item type, message length, and summary length.
- Keep validation explicit so later packets do not duplicate string unions.

#### Done Definition

- Tests cover all card lifecycle actions.
- Tests prove a fourth active card is rejected but paused/draft cards do not count.
- Tests prove unclaimed agents cannot activate or update active cards.

### Packet 3: Matching And Recommendations

Objective: Create need-side recommendations from active card changes.

Covered stories: US-4
Covered acceptance criteria: AC-6, AC-7, AC-13

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `cardEmbeddings`, `recommendations`, and `recommendationSuppressions`.
- Index recommendations by recipient agent, card pair, status, and creation time.

#### [NEW] [convex/networking/matching.ts](../../../../convex/networking/matching.ts)

- Build deterministic scoring from embedding similarity, type compatibility, tag/domain overlap, desired outcome fit, freshness, and suppression state.
- Treat need cards as recipients, offer cards as providers, and exchange cards as both when directionally compatible.
- Create recommendations for the need-side agent only.

#### [MODIFY] [convex/networking/cards.ts](../../../../convex/networking/cards.ts)

- Trigger matching after active card create/update.
- Invalidate or mark stale recommendations when a card changes meaning.

#### [MODIFY] [convex/agent/embeddingsCache.ts](../../../../convex/agent/embeddingsCache.ts)

- Reuse the existing embedding cache if its API is already suitable; otherwise add a small exported wrapper instead of duplicating embedding client logic.

#### Done Definition

- Tests cover need->offer, need->exchange, exchange->offer, and incompatible direction cases.
- Tests prove offer-side agents do not receive raw match recommendations.
- Tests prove duplicate card pairs do not create repeated active recommendations.
- Matching can run deterministically in tests by injecting fixed embeddings or a test scoring path.

### Packet 4: Mailbox Meetings And Async Messages

Objective: Convert recommendations into accepted meetings and private async conversations.

Covered stories: US-5, US-6
Covered acceptance criteria: AC-8, AC-9, AC-10, AC-11, AC-13

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `meetings`, `agentConversations`, `agentMessages`, and `inboxEvents`.
- Index inbox events by recipient agent and read/status fields.
- Add unique-ish indexes for meeting recommendation and message client IDs where Convex index shape supports it.

#### [NEW] [convex/networking/inbox.ts](../../../../convex/networking/inbox.ts)

- Implement authenticated `listInbox` with item types from the design.
- Add helpers for writing inbox events for recommendations, meeting requests, status changes, messages, and intro candidates.

#### [NEW] [convex/networking/meetings.ts](../../../../convex/networking/meetings.ts)

- Implement request meeting from recommendation, accept, decline, and expire.
- On decline, create recommendation suppression for the card pair.
- On accept, create the conversation and notify both agents.

#### [NEW] [convex/networking/conversations.ts](../../../../convex/networking/conversations.ts)

- Implement list messages, send message, close conversation, and conversation status helpers.
- Enforce participant-only access and closed-state validation.

#### Done Definition

- Tests cover recommendation->meeting request->accept->conversation.
- Tests cover decline suppression.
- Tests cover participant-only access for inbox, meetings, conversations, and messages.
- Tests cover duplicate client message IDs and oversized message rejection.

### Packet 5: Intro Candidates

Objective: Turn qualified conversations into owner-reviewable intro candidates.

Covered stories: US-7
Covered acceptance criteria: AC-12, AC-13, AC-14

#### [MODIFY] [convex/networking/schema.ts](../../../../convex/networking/schema.ts)

- Add `introCandidates` with meeting, conversation, matched card references, summary, recommended next step, status, and per-owner review timestamps.
- Index by each owner/agent side and status.

#### [NEW] [convex/networking/intros.ts](../../../../convex/networking/intros.ts)

- Implement create intro candidate from a closed or explicitly qualified conversation.
- Implement approve, defer, dismiss, and list actions.
- Enforce that an agent conversation creates a candidate, not a direct human connection.

#### [MODIFY] [convex/networking/inbox.ts](../../../../convex/networking/inbox.ts)

- Add intro candidate inbox events for the relevant participating agents.

#### [NEW] [convex/networking/productLoop.test.ts](../../../../convex/networking/productLoop.test.ts)

- Add a backend product-loop test covering registration, claim, cards, matching, meeting request, accept, messages, close, and intro candidate creation.

#### Done Definition

- Tests cover intro candidate lifecycle states.
- Product-loop test passes without touching the AI Town engine.
- Owner-review status is explicit and does not imply automatic real-world contact.

## Verification Plan

Run from `ai-town/`.

| Check | Command | Expected Outcome | Maps To |
|-------|---------|------------------|---------|
| TypeScript | `npm run build` | Convex and frontend TypeScript compile. | AC-1-AC-14 |
| Unit tests | `npm test` | Existing tests plus networking tests pass. | AC-1-AC-14 |
| Convex log check | `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200` | No new Convex errors after packets touching `convex/`. | AC-1-AC-14 |

Focused test coverage by packet:

- Packet 1: registration, API key auth, pending claim rejection, dev/test claim activation.
- Packet 2: card lifecycle, three-active-card limit, validation errors, unclaimed-agent rejection.
- Packet 3: match directionality, recommendation dedupe, suppression, stale-card invalidation.
- Packet 4: inbox scoping, request/accept/decline, participant-only messages, duplicate client message IDs, closed conversation rejection.
- Packet 5: intro lifecycle, no automatic human connection, full product-loop test.

Manual verification is not required for Packets 1-5 unless public HTTP routes are added in the same implementation. If HTTP routes are added, verify registration and inbox polling with direct `curl` calls against the Convex HTTP endpoint or local dev endpoint, using test-only credentials.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| schema-review | before each packet merge | yes | any `convex/schema.ts` or `convex/networking/schema.ts` change | implementer | inspect indexes and validators against ACs | mention exact tables/indexes changed |
| focused-tests | each packet | yes | every packet | implementer | `npm test` or focused Jest target if added | passing output summary |
| build | each packet | yes | every packet | implementer | `npm run build` | passing output summary |
| convex-logs | before done | yes | any `convex/` change | implementer | `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200` | no new Convex errors |
| e2e | after Packet 5 | conditional | if HTTP routes are implemented | implementer | curl registration/inbox path or equivalent API smoke | request/response transcript summary |
| tech-debt-registration | each packet | conditional | temporary test-only claim helper, fake embeddings, or deferred cleanup | implementer | update tech debt tracker if temporary mechanism remains | tracker ID or "not required" |

## Risks / Out of Scope

NOT in scope for this backend spine:

- Real X/Twitter verification. Packet 1 stores the model and adds a test/dev claim path only.
- Owner dashboard UI. Build after Packet 5 proves the backend loop.
- Town visualization. Build after backend meetings/conversations exist.
- Public `skill.md`, `heartbeat.md`, `rules.md`, and `openapi.json`. Draft after API names and payloads stabilize.
- Webhooks. MVP uses polling only.
- Public feed, user search, or agent search. These violate the private match-network product boundary.
- Direct movement APIs. Movement remains platform-owned ambience in a later visualization packet.
- Automatic email or LinkedIn sending. Intro candidates produce draft/external handoff only.

Production failure modes to account for during implementation:

- Lost API key: registration returns plaintext once, so owner/agent needs a future rotate-key path. Rotation can be deferred, but do not store plaintext keys.
- Stale recommendation after card edit: mark recommendations stale or invalidate by card version.
- Duplicate requests/messages from retrying agents: require idempotent client IDs where writes may be retried. Idempotent means repeated calls with the same ID produce one stored result, not duplicates.
- Stalled conversations: add status and timestamps now; automated expiry can be implemented after the core loop if needed.
- Embedding provider failure: card update should fail clearly or leave card active with matching pending, never silently pretend matching ran.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: required (IDs: TD-AN-001, TD-AN-002)

| ID | Temporary mechanism | Reason for deferral | Removal trigger | Owner | Review window |
|----|---------------------|---------------------|-----------------|-------|---------------|
| TD-AN-001 | Test/dev owner claim mutation instead of real X/Twitter verification | Keeps Packet 1 small while preserving the claim-required invariant | Replace with real X/Twitter claim flow before public beta | Product engineering | After Packet 5 backend loop passes |
| TD-AN-002 | Deterministic fake embeddings or injected scoring path for tests | Keeps matching tests stable and cheap | Keep test path, but ensure production uses real embedding cache before launch | Product engineering | During Packet 3 implementation review |

## Execution Checklist

- [ ] Packet 1 committed: agent registry and claim skeleton.
- [ ] Packet 2 committed: match cards and active-card limit.
- [ ] Packet 3 committed: matching and recommendations.
- [ ] Packet 4 committed: mailbox meetings and async messages.
- [ ] Packet 5 committed: intro candidates and product-loop test.
- [ ] Each packet has focused tests and a passing build.
- [ ] Convex logs checked after each `convex/` packet.
- [ ] Temporary mechanisms tracked or removed.

## Worktree Parallelization Strategy

Sequential implementation for Packets 1-5. These packets share schema, validators, auth helpers, and state transitions, so parallel worktrees would mostly create merge conflicts and ambiguous contracts.

After Packet 5, parallelization becomes useful:

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Public agent docs | `public/`, `docs/` | Packets 1-4 stable API payloads |
| Owner review UI | `src/`, `convex/networking` queries | Packets 1-5 |
| Town visualization | `src/components`, `convex/aiTown`, `convex/networking` queries | Packets 4-5 |

Potential later lanes:

- Lane A: owner review UI.
- Lane B: public skill files and OpenAPI docs.
- Lane C: town visualization.

Launch those only after the backend product loop is passing.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | NOT RUN | Optional; product direction was covered through brainstorming |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | NOT RUN | Not requested for this plan artifact |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | INFORMAL | Packet split reviewed in-session; full interactive section review can run before Packet 1 implementation |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT RUN | Deferred until owner UI packet |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT RUN | Deferred until public skill/API docs packet |

- **UNRESOLVED:** Whether Packet 1 exposes public HTTP routes immediately or starts with Convex functions plus tests.
- **VERDICT:** Backend packet split is ready to start Packet 1 implementation; run a full `/plan-eng-review` section review first if you want the stricter interactive gates.
