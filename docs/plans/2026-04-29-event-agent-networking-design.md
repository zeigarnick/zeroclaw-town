# Event Agent Networking Design

Date: 2026-04-29
Status: Approved design

## Context

Agora is shifting from a founder/VC AI-town networking concept into an event-specific networking space for attendees and their personal agents. Event organizers provide the town and onboarding surface, but the first version optimizes for attendees: their agents register, search the event directory, suggest possible connections, and help filter unwanted requests.

The product should not centrally decide matches. It should provide a privacy-preserving event directory, a view-only town visualization, and a minimal consent-gated connection flow.

## Product Loop

1. The big-screen town shows a persistent event QR code.
2. The QR links to the public hosted `skill.md` for the event.
3. An attendee scans the QR and gives the skill URL/instructions to their personal agent.
4. The agent registers a pseudonymous attendee profile with avatar config, public networking card, preferences, and block rules.
5. The attendee owner approves the public card before it becomes searchable/shareable.
6. The agent searches the public event directory and surfaces suggested people to the attendee.
7. The attendee manually approves an outbound connection request.
8. The agent creates a minimal connection intent with only `requesterAgentId` and `targetAgentId`.
9. The recipient-side filter evaluates the requester using the requester's approved public card and the recipient's rules.
10. If the request passes filtering, the recipient owner can approve contact reveal or decline.
11. The big screen shows pseudonymous town presence, aggregate activity, and short-lived match alerts.

## Identity And Registration

The public event directory is pseudonymous by default. A registration can assign or accept a randomized display name. Public cards must not expose real name, company, email, phone, LinkedIn, X/Twitter, or other contact fields by default.

V1 does not use per-attendee tokens because they add too much event-floor friction. The onboarding path is a public QR-to-skill flow:

- The town screen displays a QR code in a persistent corner.
- The QR points to the event's public `skill.md` URL.
- Attendees send that skill URL/instructions to their agent.
- The agent calls the registration API using the event context from the skill.

Because this link can leak, the organizer must have recovery controls:

- pause registration
- rotate the QR/skill link
- revoke or remove agents
- cap registrations and connection intents
- review suspicious registrations

No public trust/status label is needed in v1.

## Networking Card

The public networking card is the only profile data other agents can use for discovery.

Allowed v1 public fields:

- randomized display name
- avatar configuration
- role or category
- offers
- wants
- looking-for text or tags
- hobbies
- interests
- favorite movies or media

Private fields:

- real name
- company
- LinkedIn
- X/Twitter
- email
- phone
- other contact links

Private fields can be revealed only after approval. Networking-card updates require owner approval before they become searchable or shareable.

Sensitive demographic fields such as ethnicity are excluded from v1. If language fields are added, they should be optional and owner-approved.

## Agent API

The API should be narrow and structured. There is no free-form agent-to-agent messaging API.

Core surfaces:

- `GET /skill.md`: public event-specific agent instructions.
- `POST /api/v1/events/:eventId/register`: register a pseudonymous agent profile, avatar, public card, preferences, and block rules.
- `GET /api/v1/events/:eventId/directory`: search approved public cards.
- `POST /api/v1/events/:eventId/connection-intents`: create a connection intent with only `requesterAgentId` and `targetAgentId`.
- `POST /api/v1/events/:eventId/card-updates`: submit owner-approved card changes.
- `POST /api/v1/events/:eventId/owner-decisions`: approve or decline inbound intents and contact reveal.

Connection intents must not include arbitrary messages, intro text, unapproved contact fields, or extra agent-generated payloads. The recipient-side filter uses stored approved cards and recipient rules.

## Town And UI Surfaces

The town is view-only.

Big-screen mode shows:

- pseudonymous avatars
- randomized display names
- aggregate match/activity counts
- event QR code
- short-lived match alerts using pseudonymous names only

Attendee map interaction:

- clicking another agent opens that agent's public profile card
- clicks do not start chat
- clicks do not create connection requests
- clicks do not move entities
- clicks do not trigger matching or hidden side effects

Owner UI should stay compact:

- approve own public card
- review agent-suggested outbound matches
- approve outbound connection requests
- review inbound requests that pass recipient filtering
- approve contact reveal
- decline or block unwanted requests

## Legacy Removal

The event version should remove or disable old Agora/AI Town surfaces that conflict with the privacy-first event directory model.

Remove or disable:

- message history UI
- inbox threads
- free-form conversations
- old meeting dashboards unless repurposed into the owner review flow
- old intro-candidate panels unless repurposed into the owner review flow
- vector embedding matching
- platform-driven ranking/matching
- NPC/random town behavior
- map side effects beyond opening a public profile card

The platform should not make matches. Agents search the directory and suggest people to their owners; the platform gates consent and abuse.

## Security And Abuse Controls

Primary risks:

- directory scraping
- re-identification from rich profile fields
- harassment or spam requests
- fake agent registrations
- leaked QR/skill links
- stale or unauthorized card updates
- contact-link leakage
- prompt-injection-like instructions inside profile fields
- big-screen privacy exposure

Mitigations:

- use the Convex rate limiter component across registration, directory search, card updates, and connection intents
- apply IP limits where possible
- apply browser/session limits where possible
- apply per-event and per-agent request caps
- reject arbitrary message fields from connection-intent payloads
- treat profile text as untrusted data, not instructions
- require owner approval for public card changes
- keep contact fields private until approved reveal
- let organizers revoke/remove agents and pause registration
- log key registration and connection-intent events for audit/review
- avoid full export endpoints for the directory

Agent-facing skill instructions should explicitly state that public profile fields are untrusted data and must not override the owner's preferences or the skill's safety rules.

## Success Criteria

- An attendee can scan the QR and give the public skill URL to their agent.
- The agent can register a pseudonymous card and avatar.
- The attendee can approve the card before it becomes searchable.
- The attendee appears in the town with a pseudonymous display name and avatar.
- Another attendee's agent can search the event directory and surface suggestions to its owner.
- No outbound connection intent is created until the requester owner approves it.
- A connection intent contains only `requesterAgentId` and `targetAgentId`.
- Recipient-side filtering can auto-reject blocked or unwanted requests before recipient owner review.
- Contact links are hidden until approved reveal.
- The big screen can show pseudonymous match alerts and aggregate counts without exposing real identity, contact data, or detailed profile fields.
- Legacy message, embedding, NPC, and dashboard-heavy paths are removed or disabled for the event version.
