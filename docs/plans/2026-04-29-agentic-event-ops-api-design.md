# Agentic Event Operations API Design

Date: 2026-04-29
Status: Approved design

## Context

OpenNetwork's event product is shifting toward API-first operations. The platform operator should be able to create events and organizer invites through an AI agent. Each event organizer should also be able to use their own AI agent to manage their event through the same structured API surface.

The current code already has attendee owner-session tokens and event organizer controls, but organizer controls use one configured bearer token. That is acceptable for internal bootstrapping, but it is not the right credential model for multi-event organizer automation.

## Personas

- Platform operator: OpenNetwork staff or staff-owned AI agent that provisions events and organizer access.
- Event organizer: customer or customer-owned AI agent that manages one event after receiving an invite.
- Attendee agent: attendee-owned agent that registers, searches public event cards, and requests consent-gated connections.

Attendee-agent APIs remain separate from operator and organizer APIs.

## Credential Model

V1 uses long-lived revocable API keys.

- The platform operator uses a configured global bearer token only for operator-level APIs.
- Operator APIs can create events and generate event organizer invites.
- Operator APIs can list and revoke event organizer API keys for emergency containment.
- Organizer invites are single-use, expiring, and stored only as hashes.
- Redeeming an invite creates an event-scoped organizer API key.
- Organizer API keys are long-lived, revocable, stored only as hashes, and scoped to one event.
- Audit events record whether an action came from a platform operator or event organizer.

This deliberately avoids full user-account auth in v1. Clerk or Better Auth can be added later when the product needs self-serve signup, billing, persistent organization dashboards, or cross-event human login.

## Operator API

Operator APIs are intended for OpenNetwork staff tooling and platform-agent automation.

Core endpoints:

- `POST /api/v1/operator/events`: create or upsert an event.
- `GET /api/v1/operator/events/:eventId`: read event status and configuration.
- `POST /api/v1/operator/events/:eventId/organizer-invites`: create an organizer invite link.
- `GET /api/v1/operator/events/:eventId/api-keys`: list redacted organizer API keys.
- `POST /api/v1/operator/events/:eventId/api-keys/:keyId/revoke`: revoke an organizer API key, including the last active key during containment.
- `POST /api/v1/operator/events/:eventId/archive`: archive or disable an event when that lifecycle state exists.

Operator requests use `Authorization: Bearer <operator-token>`.

The operator token should not be exposed in browser UI or organizer-owned tools.

## Organizer Agent API

Organizer APIs are intended for event organizers and organizer-owned AI agents.

Core endpoints:

- `POST /api/v1/organizer/invites/:inviteToken/redeem`: redeem invite and return an organizer API key once.
- `GET /api/v1/organizer/events/:eventId`: read event status and configuration.
- `POST /api/v1/organizer/events/:eventId/registration/pause`: pause public attendee registration.
- `POST /api/v1/organizer/events/:eventId/registration/resume`: resume public attendee registration.
- `POST /api/v1/organizer/events/:eventId/skill-url`: rotate the public skill URL.
- `GET /api/v1/organizer/events/:eventId/suspicious-registrations`: review suspicious attendees.
- `GET /api/v1/organizer/events/:eventId/high-volume-requesters`: review high-volume requesters.
- `POST /api/v1/organizer/events/:eventId/agents/:eventAgentId/revoke`: revoke an attendee agent.
- `POST /api/v1/organizer/events/:eventId/agents/:eventAgentId/remove`: revoke and remove an attendee agent from public surfaces.
- `POST /api/v1/organizer/events/:eventId/api-keys`: rotate or create another organizer key for automation.
- `POST /api/v1/organizer/events/:eventId/api-keys/:keyId/revoke`: revoke an organizer key.

Organizer requests use `Authorization: Bearer <event-organizer-api-key>`.

Every organizer endpoint must verify that the key is active and scoped to the requested `eventId`.

`owner` and `staff` organizer keys can mutate event operations and manage organizer keys. `viewer` keys can read review lists but cannot mutate registration, skill URLs, attendee agents, or organizer keys.

## Event Creation And Invite Flow

1. Platform agent calls the operator event-create endpoint with `eventId`, title, optional world template, registration state, and skill URL.
2. Platform agent calls the operator invite-create endpoint with organizer metadata and optional expiry.
3. The API returns an invite URL and one-time invite token. The raw token is returned only once.
4. Organizer or organizer agent redeems the invite.
5. The API returns a long-lived organizer API key and event metadata. The raw API key is returned only once.
6. Organizer agent stores that key in its own secret storage and uses it for future event management calls.

## Error Handling

The API should return structured JSON errors with stable codes:

- `invalid_operator_token`
- `event_not_found`
- `organizer_invite_not_found`
- `organizer_invite_expired`
- `organizer_invite_already_redeemed`
- `invalid_event_organizer_token`
- `event_organizer_key_revoked`
- `event_scope_mismatch`

These codes are important because AI agents should be able to reason about recoverable failures without scraping prose.

## Security And Abuse Controls

- Store only token hashes and short key prefixes.
- Return raw invite tokens and raw API keys only at creation/redeem time.
- Rate-limit operator and organizer endpoints.
- Audit event creation, invite creation, invite redemption, registration pauses, skill URL rotation, attendee revocation, and key revocation.
- Keep the existing configured operator token as a bootstrap secret, not as an organizer credential.
- Do not let organizer keys create unrelated events or access other events.
- Do not expose organizer credentials in the town screen, public skill file, or attendee owner-review links.

## Success Criteria

- A platform AI agent can create an event through an authenticated API.
- A platform AI agent can generate an organizer invite link through an authenticated API.
- An organizer or organizer AI agent can redeem the invite and receive a long-lived event-scoped API key.
- An organizer AI agent can manage registration, skill URL rotation, suspicious registrations, high-volume requesters, and attendee revocation through authenticated APIs.
- A stolen or retired organizer key can be revoked without changing the global operator token.
- A platform operator can revoke the last active organizer key during a security incident.
- Organizer API keys cannot manage another event.

## Implementation Note

The agent-facing API contract is documented in [docs/api/agentic-event-ops.md](../api/agentic-event-ops.md).
