# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Town is a virtual town where AI characters live, chat, and socialize. It's a deployable starter kit with a Convex backend, React frontend, and a sophisticated game engine with agent behavior simulation. The project is inspired by the research paper "Generative Agents: Interactive Simulacra of Human Behavior."

## Setup & Development

**Installation:**
```bash
npm install
```

**Required:** Convex account (free) for backend development.

**Development servers:**
```bash
npm run dev              # Run frontend + backend in parallel
npm run dev:frontend     # Vite frontend server (localhost:5173)
npm run dev:backend      # Convex backend with hot reload
```

**Production build:**
```bash
npm run build            # TypeScript + Vite build
npx convex deploy       # Deploy Convex backend to production
npx convex run init --prod  # Initialize production world
```

## Testing & Quality

```bash
npm test                # Jest tests (use preset: ts-jest/presets/default-esm)
npm run lint            # ESLint check
npm run level-editor    # Run map editor at localhost:5173/src/editor/
```

**Test files:** Located adjacent to source files with `.test.ts` extensions (e.g., `convex/util/minheap.test.ts`). Key test utilities are in `convex/util/` (geometry, compression, types, async utilities).

## Architecture (See ARCHITECTURE.md for deep dives)

### Layer Overview

The project splits into cleanly separated layers:

1. **Backend (`convex/`)** - Game engine, agent simulation, database schema
   - `convex/engine/` - Generic game engine (tick-based simulation, single-threaded)
   - `convex/aiTown/` - Game logic specific to AI Town (world, players, conversations, inputs)
   - `convex/agent/` - Agent behavior, memory management, embeddings, LLM integration
   - `convex/util/` - Shared utilities (LLM config, compression, geometry, etc.)

2. **Frontend (`src/`)** - React + Pixi.js rendering
   - `src/components/` - Game UI (Game, Character, Messages, PlayerDetails, etc.)
   - `src/hooks/` - Custom React hooks (useWorldHeartbeat, useHistoricalValue, useSendInput)
   - Uses regular `useQuery` hooks for state; historical objects replay smoothly via `useHistoricalValue`

3. **Data (`data/`)** - Character definitions and map assets
   - `characters.ts` - All character names, descriptions, sprites, speeds
   - Tilemaps loaded via Tiled editor, converted with `convertMap.js`

### Key Patterns

**Game Engine (`convex/engine/AbstractGame.ts`):**
- Runs `tick()` at 60 Hz internally, batches into _steps_ running every 1 second
- Single-threaded per world (no race conditions)
- Load → Process inputs → Run simulation → Save diff pattern
- Uses generation numbers to prevent duplicate engine runs

**Input Processing:**
- Clients submit inputs → stored in `inputs` table → engine processes → results written back
- Invariants checked before mutations (e.g., can't move while in conversation)
- Defined with `inputHandler` validator in `convex/aiTown/inputs.ts`

**Agent Loop (`convex/agent/`):**
- Agents observe game state in `Agent.tick`, schedule long-running operations
- Operations call LLMs via `startOperation` (internalAction)
- Submit game changes as inputs (not direct mutations)
- Conversations inject memory/personality via embeddings and vector search

**Historical Objects:**
- Track numeric field changes per tick (position, orientation, speed)
- Client replays history for smooth motion between server updates
- Limitations: floating-point only, no nested objects

### Database Schema

- **Game tables** (`convex/aiTown/schema.ts`) - Worlds, Players, Conversations, ConversationMemberships
- **Engine tables** (`convex/engine/schema.ts`) - Engine state, World state
- **Agent tables** (`convex/agent/schema.ts`) - Agent memories, embeddings, in-progress operations
- **Messages** (`convex/schema.ts`) - Separate tables for chat history (lower latency, frequent updates)

## LLM Configuration

Default is **Ollama** (local). Configured in `convex/util/llm.ts` via environment variables:

- **Ollama:** `OLLAMA_HOST`, `OLLAMA_MODEL` (default: llama3), `OLLAMA_EMBEDDING_MODEL`
- **OpenAI:** `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`
- **Together.ai:** `TOGETHER_API_KEY`, `TOGETHER_CHAT_MODEL`, `TOGETHER_EMBEDDING_MODEL`
- **Custom OpenAI-compatible:** `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_EMBEDDING_MODEL`

Set with: `npx convex env set KEY value`

**Important:** Changing LLM provider or embedding model requires wiping data (embeddings are model-specific).

## Customization Workflow

### Characters
Edit `data/characters.ts` - name, description, spritesheet, speed. Then:
```bash
npx convex run testing:wipeAllTables
npm run dev
```

### Maps
1. Create/edit in [Tiled](https://www.mapeditor.org/) (export as JSON, 2 layers: `bgtiles` + `objmap`)
2. Convert: `node data/convertMap.js <mapPath> <assetPath> <tilesetPxW> <tilesetPxH>`
3. Update `convex/init.ts` to load the converted map

### Background Music (Optional)
- Requires [Replicate](https://replicate.com/) API token: `npx convex env set REPLICATE_API_TOKEN <token>`
- Edit prompt in `convex/music.ts`, schedule in `convex/crons.ts`
- Note: World pauses after 5 min of browser inactivity

## Debugging & Management

**Convex functions (via dashboard or CLI):**
```bash
npx convex run testing:stop      # Pause engine/agents
npx convex run testing:resume    # Resume
npx convex run testing:kick      # Kick engine if stuck
npx convex run testing:archive   # Archive current world
npx convex run init              # Create fresh world
npx convex run testing:wipeAllTables  # Full data reset
npx convex dashboard             # Web UI for data/logs/functions
```

**Simulation behavior:**
- Default step duration: 1 second
- Default tick frequency: 60 Hz (60 ticks per step)
- Input latency: ~1.5s (RTT + half step + historical lag)
- Adjust step size to trade latency vs. function calls

## Design Constraints

- Active game state must fit in memory and load/save per step (~10 KB)
- Not suitable for 10K+ interacting objects
- Single-threaded JavaScript simulation (computational limits)
- Input latency too high for competitive games
- Message streaming (OpenAI) benefits from separate tables outside the engine

## Related Documentation

- **ARCHITECTURE.md** - Deep dive into each layer and design decisions
- **convex/README.md** - Convex-specific setup
- **fly/README.md** - Fly.io deployment
