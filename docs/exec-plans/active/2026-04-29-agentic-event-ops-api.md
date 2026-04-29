# Agentic Event Operations API Execution Plan

Date: 2026-04-29
Intent: feature
Scale: large
Delivery Path: single-plan
Archetype: feature
Discovery Mode: direct-read (burst skipped because this runtime only permits sub-agent delegation when explicitly requested; current local discovery covered auth, schema, HTTP routing, and organizer-control tests)
External Freshness Gate: not triggered (implementation uses local Convex HTTP actions, schema, and existing token helpers)
Design Source: [docs/plans/2026-04-29-agentic-event-ops-api-design.md](../../plans/2026-04-29-agentic-event-ops-api-design.md)

## Context

OpenNetwork needs API-first event operations for AI agents. A platform operator agent must create events and organizer invites with a global operator token. Organizer agents must redeem invites and manage one event with long-lived revocable event-scoped API keys. Current organizer controls use a single configured token and `/api/v1/admin/events/...`; this plan replaces that product model with explicit operator and organizer API credentials.

## User Stories

| ID | Persona | Story | Value |
|----|---------|-------|-------|
| US-001 | Platform operator agent | I can create or configure an event through an authenticated API. | Events can be provisioned by staff automation. |
| US-002 | Platform operator agent | I can generate a one-time organizer invite link through an authenticated API. | Organizers can onboard without sharing the global token. |
| US-003 | Organizer agent | I can redeem an invite and receive a long-lived event-scoped API key. | Organizer automation can operate without browser login. |
| US-004 | Organizer agent | I can manage registration, skill URL rotation, suspicious registrations, requester abuse, and attendee revocation by API. | Event operations are agent-accessible. |
| US-005 | Platform/security operator | I can revoke organizer keys and audit sensitive actions. | Stolen or stale keys can be contained. |

## Acceptance Criteria

| ID | Stories | Criteria |
|----|---------|----------|
| AC-001 | US-001 | `POST /api/v1/operator/events` creates or updates an `eventSpaces` row and provisions the event world through existing event-world helpers. |
| AC-002 | US-002 | `POST /api/v1/operator/events/:eventId/organizer-invites` returns a raw invite URL/token once, stores only a hash, and records expiry/redeem state. |
| AC-003 | US-003 | `POST /api/v1/organizer/invites/:inviteToken/redeem` creates a long-lived active organizer API key scoped to the event and returns the raw key once. |
| AC-004 | US-004 | Organizer management endpoints authenticate `Bearer event_org_*` keys and reject cross-event access. |
| AC-005 | US-004 | Existing pause/resume, skill URL rotation, suspicious-registration, high-volume-requester, revoke, and remove behavior still works under organizer API keys. |
| AC-006 | US-005 | Organizer API keys can be created, listed by prefix/status, and revoked without revealing raw key material. |
| AC-007 | US-005 | Audit rows distinguish `platform_operator` from `organizer` actors and include stable actor keys/prefixes. |
| AC-008 | US-001, US-002, US-003, US-004 | HTTP errors use stable JSON codes for invalid operator token, missing/expired/redeemed invite, invalid/revoked organizer key, and event-scope mismatch. |

## Packet Plan

### Packet 1: Credential Schema And Auth Primitives

Objective: Add durable event organizer invite/API-key storage and token helpers before routing changes.

Covered stories: US-002, US-003, US-005
Covered acceptance criteria: AC-002, AC-003, AC-006, AC-008

#### [MODIFY] [convex/networking/validators.ts](../../../convex/networking/validators.ts)

- Add invite status, organizer key status, organizer role, and new organizer/operator audit type literals.
- Keep validator names explicit so schema and tests share one source.

#### [MODIFY] [convex/networking/schema.ts](../../../convex/networking/schema.ts)

- Add `eventOrganizerInvites` with event, token hash, status, role, email/name metadata, expiry, and redeemed key reference.
- Add `eventOrganizerApiKeys` with event, key hash, key prefix, status, role, label, created/revoked/last-used timestamps.
- Add indexes for token hash, event/status, and event/key prefix lookup.

#### [MODIFY] [convex/networking/auth.ts](../../../convex/networking/auth.ts)

- Add `event_org_invite_*` and `event_org_*` token generators plus shared prefix helpers.
- Add stable error codes for operator token, invite, revoked key, and scope mismatch failures.

#### [NEW] [convex/networking/eventOrganizerAuth.ts](../../../convex/networking/eventOrganizerAuth.ts)

- Implement operator-token assertion against configured env keys.
- Implement invite hashing/lookup, organizer key authentication, event-scope checks, and last-used updates.

#### [NEW] [convex/networking/eventOrganizerAuth.test.ts](../../../convex/networking/eventOrganizerAuth.test.ts)

- Cover hashing, invite status failures, active/revoked key auth, and event-scope mismatch.

Done definition: credential tables and auth helpers compile and focused auth tests pass.

### Packet 2: Operator Event And Invite APIs

Objective: Let platform agents create events and organizer invites through authenticated HTTP APIs.

Covered stories: US-001, US-002, US-005
Covered acceptance criteria: AC-001, AC-002, AC-007, AC-008

#### [NEW] [convex/networking/eventOperatorControls.ts](../../../convex/networking/eventOperatorControls.ts)

- Add mutations/handlers for create-or-update event, get event config, and create organizer invite.
- Reuse `ensureEventSpaceWorld` and existing event-space normalization.
- Write audit rows with `actorKind: "platform_operator"`.

#### [MODIFY] [convex/networking/http.ts](../../../convex/networking/http.ts)

- Add `/api/v1/operator/events` create/read routes.
- Add `/api/v1/operator/events/:eventId/organizer-invites`.
- Parse operator authorization separately from attendee and organizer bearer headers.

#### [NEW] [convex/networking/eventOperatorControls.test.ts](../../../convex/networking/eventOperatorControls.test.ts)

- Cover operator event creation, idempotent update, invite creation, raw token returned once, and invalid operator token failures.

#### [MODIFY] [convex/networking/http.test.ts](../../../convex/networking/http.test.ts)

- Add route-level coverage for operator event creation and invite creation.

Done definition: a platform-agent client can create an event and invite without direct Convex dashboard access.

### Packet 3: Organizer Invite Redemption And Key Management APIs

Objective: Let organizers redeem invites and manage long-lived API keys for their event agents.

Covered stories: US-003, US-005
Covered acceptance criteria: AC-003, AC-006, AC-007, AC-008

#### [NEW] [convex/networking/eventOrganizerCredentials.ts](../../../convex/networking/eventOrganizerCredentials.ts)

- Add invite redemption, key listing, key creation, and key revocation handlers.
- Return raw organizer keys only on redeem/create responses.
- Prevent revoking the only active key unless caller uses an operator route or explicit replacement flow.

#### [MODIFY] [convex/networking/http.ts](../../../convex/networking/http.ts)

- Add `/api/v1/organizer/invites/:inviteToken/redeem`.
- Add `/api/v1/organizer/events/:eventId/api-keys` list/create routes.
- Add `/api/v1/organizer/events/:eventId/api-keys/:keyId/revoke`.

#### [NEW] [convex/networking/eventOrganizerCredentials.test.ts](../../../convex/networking/eventOrganizerCredentials.test.ts)

- Cover successful redeem, expired invite, already redeemed invite, key creation, redacted listing, and revocation.

#### [MODIFY] [convex/networking/http.test.ts](../../../convex/networking/http.test.ts)

- Add route-level coverage for redeem, list/create/revoke keys, and stable error codes.

Done definition: an organizer agent can bootstrap and rotate its event-scoped credentials entirely through API calls.

### Packet 4: Move Organizer Controls To Event-Scoped Keys

Objective: Replace the shared organizer-token authorization path with event-scoped organizer API keys.

Covered stories: US-004, US-005
Covered acceptance criteria: AC-004, AC-005, AC-007, AC-008

#### [MODIFY] [convex/networking/eventOrganizerControls.ts](../../../convex/networking/eventOrganizerControls.ts)

- Replace `organizerToken` args with authenticated organizer actor context in handler internals.
- Preserve public Convex mutation wrappers only if tests or generated API still need them, but require event-scoped organizer token auth.
- Write audit rows using organizer key prefix or organizer id as actor key.

#### [MODIFY] [convex/networking/http.ts](../../../convex/networking/http.ts)

- Add `/api/v1/organizer/events/:eventId/...` routes for registration, skill URL, suspicious registrations, high-volume requesters, revoke, and remove.
- Remove or reject legacy `/api/v1/admin/events/...` organizer-token routes with a stable unsupported-route error if compatibility is not required.

#### [MODIFY] [convex/networking/eventOrganizerControls.test.ts](../../../convex/networking/eventOrganizerControls.test.ts)

- Replace env-token setup with seeded organizer API keys.
- Add cross-event rejection tests.

#### [MODIFY] [convex/networking/http.test.ts](../../../convex/networking/http.test.ts)

- Update admin route tests to organizer route tests.
- Assert invalid/revoked/cross-event organizer keys fail predictably.

Done definition: existing organizer operations work only through active event-scoped organizer API keys.

### Packet 5: API Docs And Agent Contract

Objective: Make the API usable by LLM agents without reading source code.

Covered stories: US-001, US-002, US-003, US-004, US-005
Covered acceptance criteria: AC-001 through AC-008

#### [NEW] [docs/api/agentic-event-ops.md](../../../docs/api/agentic-event-ops.md)

- Document operator and organizer endpoints, auth headers, request/response examples, and error codes.
- Include a minimal platform-agent flow and organizer-agent flow.

#### [MODIFY] [docs/plans/2026-04-29-agentic-event-ops-api-design.md](../../plans/2026-04-29-agentic-event-ops-api-design.md)

- Add a short implementation note linking to the API docs once written.

Done definition: an external AI agent can follow docs to create an event, generate an invite, redeem it, and manage organizer operations.

## Verification Plan

- `npm run build`: required after schema, Convex, and HTTP route changes; expected TypeScript and Vite success. Maps to AC-001 through AC-008.
- `npm run test:networking`: required after networking changes; expected pass. Maps to AC-001 through AC-008.
- Focused tests: `npm test -- convex/networking/eventOrganizerAuth.test.ts convex/networking/eventOperatorControls.test.ts convex/networking/eventOrganizerCredentials.test.ts convex/networking/eventOrganizerControls.test.ts convex/networking/http.test.ts`; expected pass.
- API smoke via direct HTTP route tests or local Convex HTTP helper: operator create event -> create invite -> organizer redeem -> pause registration -> revoke key -> rejected follow-up call. Maps to AC-001 through AC-008.
- Convex log check after Convex changes: `node /Users/nick/.config/opencode/scripts/check-convex-logs.mjs --history 200`; expected no new Convex errors.

## Execution Quality Policy

| gate | stage | required | trigger | executor | command/method | evidence |
|------|-------|----------|---------|----------|----------------|----------|
| schema-auth-tests | packet/final | yes | credential/auth changes | implementer | focused auth and credential tests | passing output |
| networking-tests | packet/final | yes | `convex/networking/*` changes | implementer | `npm run test:networking` | passing output |
| type-build | final | yes | TS/Convex/HTTP changes | implementer | `npm run build` | passing output |
| api-smoke | final | yes | operator/organizer HTTP routes | implementer | operator-to-organizer flow | response evidence |
| convex-logs | final | yes | Convex code changes | implementer | log check command above | no new errors |
| oracle-review | final | yes | auth/security surface | oracle | adversarial review of implementation diff | no blocking findings |
| tech-debt-registration | final | conditional | legacy `/admin/events` compatibility retained | implementer | tracker entry or not-required statement | tracker/status |

## Risks / Out of Scope

- Do not expose the global operator token to browser UI, skill files, attendee links, or organizer-owned tools.
- Do not add Clerk, Better Auth, billing, or full self-serve signup in this plan.
- Do not mix attendee owner-session tokens with organizer API keys.
- Do not store raw invite tokens or raw organizer API keys after creation/redeem responses.
- Existing dirty `package.json`, untracked `AGENTS.md`, and generated asset files must remain untouched unless the implementer owns those changes.

## Deferred Cleanup / Tech Debt

Tech Debt Tracker: not required

The preferred implementation removes or rejects the legacy `/api/v1/admin/events/...` shared-token organizer routes. If compatibility aliases are intentionally retained, register a tracker item before completion.

## Execution Checklist

- [ ] Packet 1: Add credential schema and auth primitives.
- [ ] Packet 2: Add platform operator event and invite APIs.
- [ ] Packet 3: Add organizer invite redemption and key management APIs.
- [ ] Packet 4: Move organizer controls to event-scoped keys.
- [ ] Packet 5: Document the agent-facing API contract.
- [ ] Run build, networking tests, focused tests, API smoke, Convex log check, and oracle review.
- [ ] Commit each discrete packet atomically with explicit pathspecs.

## Discovery Summary

- `convex/networking/schema.ts` already has `eventSpaces`, attendee `eventOwnerSessions`, event agents, cards, activity, and organizer audit rows.
- `convex/networking/eventOrganizerControls.ts` currently protects organizer actions with a configured shared token and writes organizer audit events.
- `convex/networking/http.ts` currently exposes organizer controls under `/api/v1/admin/events/...` with a generic bearer parser.
- `convex/networking/auth.ts` already has hash/generate/prefix helpers that can be extended for event organizer invite and API-key tokens.
- `src/App.tsx` has inactive Clerk comments, confirming account-login UI is not currently wired into the app.
