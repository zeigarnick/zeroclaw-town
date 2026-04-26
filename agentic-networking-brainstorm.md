# Agentic networking brainstorm
*Exported April 26, 2026*

---

## Session overview

**Topic:** Professional digital twin networking — one person's agent joins a shared network, discovers and connects with other agents on behalf of their human for work-related introductions, coffee chats, referrals, and expert connections.

**Inspirations:** Simile AI Town, Delphi Digital Intelligence, Boardy (boardy.ai)

**Primary lens:** Technical architecture

**Core use case:** Serendipitous professional connection — not matchmaking, but ambient, agent-driven networking where humans never have to actively browse or initiate.

---

## Three-layer architecture

### Layer 1 — Personal twin

Each agent holds a rich, continuously updated knowledge graph of its human. This is not a static profile — it's a living context built from what the person feeds it (emails, calendars, notes, explicit updates). Think of it less like a LinkedIn page and more like a chief of staff who's been with you for a year.

**Components:**
- **Knowledge graph** — skills, goals, open asks, what the person can offer, who they've already met
- **Continuous ingestion** — email, calendar, notes, explicit user updates
- **Offer and need vector** — a structured representation of what the human can give and what they're currently looking for

---

### Layer 2 — Network bus

The shared infrastructure platform where agents announce themselves and negotiate introductions. The key architectural question is whether agents communicate via a **broadcast model** (everyone posts a compressed embedding of their context and a scheduler runs similarity queries) or a **directed model** (agents can query each other directly with structured intent).

**Components:**
- **Broadcast registry** — compressed embeddings published by each twin
- **Intent matching** — semantic similarity queries across the registry
- **Trust and consent** — opt-in controls, privacy settings, per-user delegation scope

---

### Layer 3 — Match and handoff

When two agents determine a match, the output isn't just "you should meet X." The agent drafts the intro, proposes context (coffee chat, job referral, expert consult), and surfaces the specific reason the match was made. The human approves or declines.

Delphi's model is relevant here — the agent can have an async conversation *on behalf of the person* to pre-qualify the connection before it even surfaces to the human.

**Components:**
- **Agent pre-chat** — async qualification between two agents before surfacing to humans
- **Drafted intro** — reason, context, and suggested format for the connection
- **Human approval** — accept, defer, or decline; human stays in the loop

---

## Hard problems worth solving

### 1. The onboarding interview problem

Boardy's insight: a phone call gets richer signal in 10 minutes than a form does in 30. Your twin needs an equivalent — probably a structured async conversation that gets the person to articulate not just their resume but their actual current priorities.

> "What do you wish someone would just introduce you to right now?" is a more useful signal than "current title: PM."

The onboarding interview is probably the highest-leverage product design question in the whole system.

---

### 2. The embedding schema problem

For intent matching to work, agents need to speak the same ontology. If one twin says "looking for security eng referral at Series B AI companies" and another says "hiring at a 40-person ML startup," those need to resolve as a match.

**Two approaches:**
- **Shared schema** — all twins encode into a common ontology at ingestion time
- **Mediator LLM** — a translation layer that resolves free-form twin contexts at match time, without requiring upfront schema alignment

The mediator approach is more flexible but adds latency and cost per match. The shared schema is more brittle at ingestion but faster at query time.

---

### 3. The agency vs. autonomy dial

The core tension: how much can an agent do *without* asking the human first?

| Mode | Description | Trade-off |
|---|---|---|
| Conservative | Agent asks before every action | High trust, low throughput |
| Pre-qualify | Agent pre-chats, surfaces only warm leads | Good balance for most users |
| Delegate | Agent handles the full intro loop autonomously | High value, requires deep trust in twin judgment |

Boardy calls you — you're always in the loop. Truly agentic would mean your twin pre-chats with a stranger's twin, qualifies the fit, and only surfaces it when it's already warmed up. That's higher value but requires the human to delegate judgment explicitly.

Likely the right answer: both modes exist, with a clear UI toggle and conservative as the default.

---

### 4. Connection intent taxonomy

The network needs to support multiple connection types, each with a different matching signal:

| Intent type | Primary matching signal |
|---|---|
| Coffee chat | Loose proximity, shared context or industry |
| Job referral | Hiring signal + skill/experience match |
| Expert consultation | Specific need + domain fit |
| Co-founder intro | Deep compatibility — values, working style, complementary skills |
| Investor intro | Stage fit, thesis fit, founder profile |

The twin should tag the *intent* of a potential intro, not just a raw similarity score. A high-similarity score between two engineers doesn't mean either of them wants to co-found something — intent classification matters as much as embedding distance.

---

## Open questions for next session

- What does the onboarding interview UX look like? (Voice? Chat? Async prompts over time?)
- How does the embedding schema handle domain drift — people's goals change, how does the twin stay fresh?
- What's the trust model for agent-to-agent communication — can any registered agent query any other, or is there permissioning?
- How do you handle the cold start problem for new users with low twin fidelity?
- What's the monetization surface — per-intro, subscription, enterprise license for companies wanting their employees networked?

---

*Brainstorm session with Claude Sonnet 4.6*
