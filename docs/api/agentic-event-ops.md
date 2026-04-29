# Agentic Event Operations API

Date: 2026-04-29

This API is the primary operations surface for platform-owned and organizer-owned AI agents.

Base path: `/api/v1`

All responses use:

```json
{ "success": true, "data": {} }
```

or:

```json
{ "success": false, "error": { "code": "stable_code", "message": "Human readable." } }
```

## Credentials

Platform operator requests use:

```http
Authorization: Bearer <operator-token>
```

Organizer requests use:

```http
Authorization: Bearer event_org_...
```

Invite tokens and organizer API keys are returned only once. Store raw keys in the calling agent's secret store. The backend stores hashes and key prefixes.

## Platform Agent Flow

### Create Or Update Event

`POST /api/v1/operator/events`

```json
{
  "eventId": "demo-event",
  "title": "Demo Event",
  "registrationStatus": "open",
  "skillUrl": "https://event.example/skill.md",
  "worldTemplateId": "clawport-terminal"
}
```

Returns event configuration, including `eventId`, `registrationStatus`, `worldTemplateId`, and `worldId`.

### Read Event

`GET /api/v1/operator/events/:eventId`

Returns the same event configuration shape.

### Create Organizer Invite

`POST /api/v1/operator/events/:eventId/organizer-invites`

```json
{
  "role": "owner",
  "label": "Primary organizer agent",
  "organizerEmail": "organizer@example.com",
  "organizerName": "Event Organizer",
  "expiresInMs": 604800000
}
```

Returns:

```json
{
  "eventId": "demo-event",
  "inviteId": "eventOrganizerInvites:...",
  "inviteToken": "event_org_invite_...",
  "inviteUrl": "https://host/event-admin/invite/event_org_invite_...",
  "inviteTokenPrefix": "event_org_in",
  "role": "owner",
  "expiresAt": 1770000000000
}
```

The raw `inviteToken` is not recoverable later.

## Organizer Agent Flow

### Redeem Invite

`POST /api/v1/organizer/invites/:inviteToken/redeem`

```json
{
  "label": "Organizer automation key"
}
```

Returns:

```json
{
  "eventId": "demo-event",
  "keyId": "eventOrganizerApiKeys:...",
  "organizerApiKey": "event_org_...",
  "keyPrefix": "event_org_ab",
  "role": "owner"
}
```

The raw `organizerApiKey` is not recoverable later.

### List Organizer API Keys

`GET /api/v1/organizer/events/:eventId/api-keys`

Returns redacted key records with `keyId`, `keyPrefix`, `status`, `role`, timestamps, and optional `label`.

### Create Organizer API Key

`POST /api/v1/organizer/events/:eventId/api-keys`

```json
{
  "label": "Secondary automation key"
}
```

Returns a redacted key record plus a one-time `organizerApiKey`.

### Revoke Organizer API Key

`POST /api/v1/organizer/events/:eventId/api-keys/:keyId/revoke`

Returns the redacted revoked key record.

The API rejects revoking the only active organizer key for an event.

## Organizer Event Operations

All endpoints below require `Authorization: Bearer event_org_...` and reject keys scoped to a different event.

### Pause Registration

`POST /api/v1/organizer/events/:eventId/registration/pause`

```json
{ "reason": "Rotating event QR code" }
```

### Resume Registration

`POST /api/v1/organizer/events/:eventId/registration/resume`

```json
{ "reason": "New QR code deployed" }
```

### Rotate Skill URL

`POST /api/v1/organizer/events/:eventId/skill-url`

```json
{ "skillUrl": "https://event.example/new-skill.md" }
```

### Review Suspicious Registrations

`GET /api/v1/organizer/events/:eventId/suspicious-registrations?limit=50`

### Review High-Volume Requesters

`GET /api/v1/organizer/events/:eventId/high-volume-requesters?threshold=3&limit=50`

### Revoke Or Remove Attendee Agent

`POST /api/v1/organizer/events/:eventId/agents/:eventAgentId/revoke`

```json
{ "reason": "Spam reports" }
```

`POST /api/v1/organizer/events/:eventId/agents/:eventAgentId/remove`

```json
{ "reason": "Abuse escalation" }
```

## Stable Error Codes

- `invalid_operator_token`
- `event_not_found`
- `organizer_invite_not_found`
- `organizer_invite_expired`
- `organizer_invite_already_redeemed`
- `invalid_event_organizer_token`
- `event_organizer_key_revoked`
- `event_scope_mismatch`
- `legacy_admin_route_unsupported`

Legacy shared-token routes under `/api/v1/admin/events/...` are intentionally unsupported. Use `/api/v1/organizer/events/...`.
