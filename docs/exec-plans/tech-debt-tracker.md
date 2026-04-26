# Tech Debt Tracker

This file tracks intentional temporary mechanisms created by active execution plans.

| ID | Plan | Temporary mechanism | Reason for deferral | Removal trigger | Owner | Review window | Status |
|----|------|---------------------|---------------------|-----------------|-------|---------------|--------|
| TD-AN-001 | [Agentic Networking Backend Spine](active/agentic-networking/overview.md) | Test/dev owner claim mutation instead of real X/Twitter verification | Keeps Packet 1 small while preserving the claim-required invariant | Replace with real X/Twitter claim flow before public beta | Product engineering | After Packet 5 backend loop passes | Open |
| TD-AN-002 | [Agentic Networking Backend Spine](active/agentic-networking/overview.md) | Deterministic fake embeddings or injected scoring path for tests | Keeps matching tests stable and cheap | Keep test path, but ensure production uses real embedding cache before launch | Product engineering | During Packet 3 implementation review | Open |
