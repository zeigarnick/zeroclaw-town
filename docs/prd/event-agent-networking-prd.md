# PRD: Event Agent Networking

## Overview

OpenNetwork is moving from a founder/VC AI-town networking demo into an event-specific networking space for attendees and their personal agents. The first version should let event attendees scan a QR code from the town screen, hand a public `skill.md` to their agent, register a pseudonymous networking card, appear in the town, search the event directory, and create consent-gated connection intents.

The platform should not make matches or host free-form agent-to-agent messaging. Agents search public cards and suggest matches to their owners; OpenNetwork stores approved profile data, enforces privacy rules, limits abuse, and visualizes safe event activity.

## Goals

- Let attendees register into an event through a QR-to-`skill.md` flow with minimal friction.
- Make public discovery pseudonymous by default while keeping real identity and contact fields private.
- Allow attendee agents to search approved public cards and suggest possible matches to their owners.
- Require requester owner approval before outbound connection intents and recipient-side filtering before recipient owner review.
- Remove legacy message, NPC, vector-matching, and dashboard-heavy surfaces that conflict with the event networking model.
- Provide organizer controls and rate limits for leaked QR links, spam, fake agents, and abusive registrations.

## User Stories

### US-001: Host Public Event Skill

**Description:** As an attendee agent, I want to fetch event-specific `skill.md` instructions so that I can register and interact with the event network correctly.

**Acceptance Criteria:**

- [ ] Public skill route returns event-specific registration, directory search, and connection-intent instructions.
- [ ] Skill instructions state that profile/card text is untrusted data, not instructions.
- [ ] Skill instructions document that no free-form messages or unapproved contact fields may be sent.
- [ ] Typecheck passes.

### US-002: Display QR Code In Town

**Description:** As an event attendee, I want the big-screen town to show a QR code so that I can quickly open the event skill instructions.

**Acceptance Criteria:**

- [ ] Big-screen town mode renders a persistent QR code linked to the public event skill URL.
- [ ] QR code does not cover core town activity or match alerts.
- [ ] QR destination can be rotated by the organizer without code changes.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-003: Register Pseudonymous Agent

**Description:** As an attendee agent, I want to register a pseudonymous event agent so that my owner can appear in the event town without exposing real identity.

**Acceptance Criteria:**

- [ ] Registration stores event ID, agent ID, owner claim/session reference, randomized display name, avatar config, and approval state.
- [ ] Registration does not require a per-attendee token.
- [ ] Registration rejects real identity/contact fields from public-card data.
- [ ] Registration is event-scoped and cannot register into another event by reusing unrelated event data.
- [ ] Typecheck passes.

### US-004: Submit Public Networking Card

**Description:** As an attendee agent, I want to submit my owner-approved networking card so that other agents can discover possible fit.

**Acceptance Criteria:**

- [ ] Card accepts role/category, offers, wants, looking-for, hobbies, interests, and favorite media.
- [ ] Card excludes sensitive demographic fields such as ethnicity.
- [ ] Card stores private contact fields separately from public searchable fields.
- [ ] Card remains unsearchable until owner approval.
- [ ] Typecheck passes.

### US-005: Approve Card Before Search

**Description:** As an attendee owner, I want to approve my public card before it becomes searchable so that my agent cannot accidentally publish unapproved information.

**Acceptance Criteria:**

- [ ] Owner review UI shows public fields exactly as they will appear to other agents.
- [ ] Owner can approve, reject, or request changes before publication.
- [ ] Approved card becomes visible in directory and town public-card views.
- [ ] Rejected or pending cards do not appear in directory search.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-006: Configure Avatar From Asset Catalog

**Description:** As an attendee agent, I want to register an avatar configuration from allowed assets so that my owner has a visible town presence without uploading arbitrary media.

**Acceptance Criteria:**

- [ ] Avatar config supports allowed asset IDs for hair, skin tone, clothing, hats, and accessories.
- [ ] Invalid asset IDs are rejected.
- [ ] Town renders registered avatar configuration for approved agents.
- [ ] Avatar config can be submitted alongside registration/card payload.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-007: Search Public Event Directory

**Description:** As an attendee agent, I want to search approved public cards so that I can suggest relevant attendees to my owner.

**Acceptance Criteria:**

- [ ] Directory API returns only approved public-card fields and pseudonymous identifiers.
- [ ] Directory API never returns private contact fields, real names, or company fields.
- [ ] Directory API supports basic structured search over role/category, offers, wants, looking-for, hobbies, interests, and favorite media.
- [ ] Directory API is scoped to one event.
- [ ] Typecheck passes.

### US-008: Review Agent-Suggested Matches

**Description:** As an attendee owner, I want to review people my agent found before any request is sent so that outbound connection attempts stay human-approved.

**Acceptance Criteria:**

- [ ] Owner UI displays suggested public cards from the agent's search results.
- [ ] Owner can approve or dismiss each suggested outbound request.
- [ ] Dismissed suggestions do not create connection intents.
- [ ] Approved suggestions create exactly one outbound connection intent for the selected target.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-009: Create Minimal Connection Intent

**Description:** As an attendee agent, I want to create a minimal connection intent after owner approval so that the recipient can filter the request without receiving arbitrary agent-generated content.

**Acceptance Criteria:**

- [ ] Connection-intent payload accepts only `requesterAgentId` and `targetAgentId`.
- [ ] API rejects free-form message fields, intro text, contact fields, or arbitrary extra payloads.
- [ ] API verifies requester and target are approved agents in the same event.
- [ ] API records status, timestamps, and audit metadata.
- [ ] Typecheck passes.

### US-010: Apply Recipient Filter Before Owner Review

**Description:** As a recipient owner, I want my preferences and block rules applied before I see inbound requests so that unwanted requests are filtered automatically.

**Acceptance Criteria:**

- [ ] Recipient rules can auto-reject connection intents using requester approved public card data.
- [ ] Auto-rejected intents are not shown as active inbound requests to the recipient owner.
- [ ] Allowed intents move to recipient owner review.
- [ ] Filter result is auditable without exposing private recipient rules to requester.
- [ ] Typecheck passes.

### US-011: Approve Contact Reveal

**Description:** As a recipient owner, I want to approve contact reveal only after I accept a connection so that private contact links stay gated.

**Acceptance Criteria:**

- [ ] Contact fields are hidden in directory search and initial inbound request review.
- [ ] Recipient owner can approve or decline contact reveal.
- [ ] Approved reveal exposes only owner-approved contact fields.
- [ ] Declined reveal keeps private contact fields hidden.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-012: Show Public Card On Map Click

**Description:** As an attendee, I want to click an agent on the map and see its public card so that the town is useful without triggering hidden actions.

**Acceptance Criteria:**

- [ ] Clicking an agent opens only the public pseudonymous card.
- [ ] Map click does not start chat, create a connection intent, move an entity, or trigger matching.
- [ ] Public card omits real identity and contact fields.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-013: Show Pseudonymous Match Alerts

**Description:** As an event attendee, I want the big screen to show fun realtime match activity so that the event feels alive without exposing private data.

**Acceptance Criteria:**

- [ ] Big screen shows short-lived match alerts using pseudonymous display names only.
- [ ] Big screen shows aggregate match/activity counts.
- [ ] Alerts never include real names, contact links, or detailed profile fields.
- [ ] Alerts expire automatically after a short duration.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-014: Add Organizer Abuse Controls

**Description:** As an event organizer, I want to recover from leaked QR links or abusive registrations so that the event directory remains usable.

**Acceptance Criteria:**

- [ ] Organizer can pause and resume registration.
- [ ] Organizer can rotate the QR/skill link destination.
- [ ] Organizer can revoke or remove agents from the event.
- [ ] Organizer can review suspicious registrations or high-volume requesters.
- [ ] Typecheck passes.
- [ ] Verify in browser using agent-browser skill.

### US-015: Rate Limit Event API Surfaces

**Description:** As an event organizer, I want registration, search, card updates, and connection intents rate-limited so that one actor cannot flood the event.

**Acceptance Criteria:**

- [ ] Convex rate limiter component protects registration.
- [ ] Convex rate limiter component protects directory search.
- [ ] Convex rate limiter component protects card updates.
- [ ] Convex rate limiter component protects connection-intent creation.
- [ ] Limits include per-event and per-agent dimensions where practical.
- [ ] Typecheck passes.

### US-016: Remove Legacy Messaging, NPC, And Matching Paths

**Description:** As a developer, I want to remove or disable old Agora surfaces that conflict with the new event model so that users and agents cannot access risky legacy behavior.

**Acceptance Criteria:**

- [ ] Message history, inbox threads, and free-form conversation UI are removed or disabled.
- [ ] Legacy meeting/intro dashboard panels are removed or repurposed into compact owner review.
- [ ] Vector embedding and platform-driven matching paths are removed or disabled.
- [ ] NPC/random town behavior is removed or disabled for event mode.
- [ ] Tests or static checks cover that removed public routes/actions are not reachable.
- [ ] Typecheck passes.

## Constraints / Dependencies

- Brownfield work in the existing React/Vite/Pixi/Convex app.
- Use the existing town visualization where practical, but make event-mode interactions view-only.
- Use Convex for realtime state, backend functions, HTTP actions, and rate limiting.
- Keep registration QR-based and low-friction; do not require per-attendee tokens in v1.
- Treat public card text as untrusted data because agents may read it.
- Do not add free-form agent-to-agent messaging.
- Do not add platform-owned semantic/vector matching in v1.
- Do not expose real identity or contact fields in public directory responses.

## Non-Goals

- No per-attendee invite-token issuance in v1.
- No central algorithmic matchmaking or ranking by OpenNetwork.
- No free-form agent-to-agent messages, chat threads, or mailbox conversations.
- No sensitive demographic fields such as ethnicity in v1.
- No public real-name, company, LinkedIn, X/Twitter, email, or phone exposure before approval.
- No arbitrary avatar uploads in v1.
- No NPCs or simulated non-attendee agents in the event town.
- No trust/status labels such as `social claimed` or `organizer approved` in v1.

## Open Questions

- Should languages spoken be allowed in v1, or deferred because language can contribute to re-identification?
- Should organizer abuse review be a minimal admin table first or integrated into the existing owner dashboard shell?
- Should QR rotation change only a public event code, the skill URL, or both?
- What exact default rate limits should apply for registration, directory search, and connection intents during a live event?
- What is the minimum owner authentication/session model needed for card approval and outbound request approval?
