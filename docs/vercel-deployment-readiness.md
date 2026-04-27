# Vercel Deployment Readiness Report

Date: 2026-04-26
Status: pre-Packet 10 deployment preparation only. Do not treat this as launch readiness.

## Current Compatibility Summary

The app is a Vite React static frontend with Convex backend functions and Convex HTTP Actions. Vercel can build and serve the frontend from `dist`. Full-stack preview or production deploys must run through Convex so the frontend build receives the correct `VITE_CONVEX_URL` and the Convex functions are deployed with the same revision.

Repository config now encodes that contract:

- Vercel framework preset: `vite`
- Vercel build command: `node scripts/vercel-build.mjs`
- Vercel output directory: `dist`
- Vercel build script: `scripts/vercel-build.mjs` runs `npm run build:vercel` when `CONVEX_DEPLOY_KEY` exists, otherwise it runs `npm run build` with `VITE_CONVEX_URL=https://youthful-sockeye-531.convex.cloud`.
- Static asset base: Vite uses `base: '/ai-town'`, with a Vercel rewrite from `/ai-town/:match*` to `/:match*`

This prepares the project for Vercel compatibility without treating a frontend-only deploy as launch-ready.

## Convex Deployment Strategy

Use one Vercel project pointing at this app root. The Vercel build script is intentionally conditional: it runs the Convex deploy wrapper when `CONVEX_DEPLOY_KEY` is set, and otherwise runs a frontend-only Vite build against `https://youthful-sockeye-531.convex.cloud` so pre-launch preview builds do not fail solely because Convex deploy keys have not been installed yet.

Set `CONVEX_DEPLOY_KEY` in Vercel with environment scoping:

- Production: Convex production deploy key, scoped only to Vercel Production.
- Preview: Convex preview deploy key, scoped only to Vercel Preview.
- Development: do not use the production deploy key locally; local development should continue using `.env.local` from `convex dev`.

During full-stack Vercel builds, `convex deploy` reads `CONVEX_DEPLOY_KEY`, deploys functions, sets `VITE_CONVEX_URL` for the nested `npm run build`, and the built frontend connects to that Convex deployment.

When `CONVEX_DEPLOY_KEY` is missing, Vercel only runs `npm run build` with `VITE_CONVEX_URL` set. That is acceptable for checking static frontend compatibility against the current Convex production deployment, but it does not deploy Convex functions and must not be used as launch evidence.

Preview deployments are expected to use fresh Convex preview backends. They do not share production data. Packet 10 smoke/E2E must either seed preview data or run against a known non-production endpoint.

## Required Environment Variables

Vercel build environment:

- `CONVEX_DEPLOY_KEY`: required for full-stack preview/production deploys. Use production key for Production and preview key for Preview. If omitted, Vercel runs a frontend-only build against the configured Convex production URL and prints a warning.

Frontend build/runtime:

- `VITE_CONVEX_URL`: preferred by `src/components/ConvexClientProvider.tsx`. Full-stack builds receive it from `convex deploy --cmd`; fallback frontend-only builds and production bundles without an explicit value use `https://youthful-sockeye-531.convex.cloud`.
- `VITE_NETWORKING_API_BASE_URL`: optional override for dashboard HTTP calls. Leave unset for normal Vercel builds so the app can use same-origin `/api/v1` through the Vercel rewrite.
- `VITE_SHOW_DEBUG_UI`: optional debug flag.

Convex deployment environment:

- `LLM_PROVIDER=custom`, `LLM_API_URL=https://openrouter.ai/api`, `LLM_API_KEY`, `LLM_MODEL=openai/gpt-4o-mini`, `LLM_EMBEDDING_MODEL=openai/text-embedding-3-small`: required for the current OpenRouter-backed production AI Town chat and embedding path.
- `NETWORKING_CLAIM_BASE_URL`: production claim link base. Current working value is `https://agora.vercel.app/claim` until `agora.town` is registered and configured.
- `OPENAI_API_KEY`: alternative provider key if production AI Town initialization or agent memory uses the native OpenAI path instead of custom OpenRouter config.
- `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`: optional OpenAI model overrides for native OpenAI mode.
- `TOGETHER_API_KEY`, `TOGETHER_CHAT_MODEL`, `TOGETHER_EMBEDDING_MODEL`: optional only if the embedding dimension/provider code is changed to Together.
- `REPLICATE_API_TOKEN`: required only for background music generation.
- `CONVEX_SITE_URL`: required for Replicate webhooks if music generation is enabled.
- `AI_TOWN_MAP_SLICE`: optional; set to `founderCafe` only when the Founder Cafe slice has completed runtime visual QA.
- `NUM_MEMORIES_TO_SEARCH`: optional tuning value.

## Convex HTTP `/api/v1/*` Reachability

Convex HTTP Actions are defined in `convex/http.ts` with `pathPrefix: '/api/v1/'` for GET, POST, and OPTIONS.

The deployed frontend can reach these routes in two supported ways:

- Same-origin Vercel route: `https://agora.vercel.app/api/v1/*` rewrites to `https://youthful-sockeye-531.convex.site/api/v1/*`.
- Convex HTTP Actions origin: `src/networking/api.ts` can derive `https://<deployment>.convex.site/api/v1` from `VITE_CONVEX_URL`.

The Convex HTTP handler sends permissive CORS headers, so browser calls from Vercel preview and production origins are allowed.

Important constraint: `https://agora.town` is not currently usable. Public DNS has no records for the domain, and Vercel reports it as available for purchase. Use `https://agora.vercel.app` until the domain is purchased, attached to the correct Vercel project, and DNS has propagated.

## Preview And Production Differences

Production:

- Uses the production Convex deployment selected by the production deploy key.
- Must have production Convex environment variables configured before launch smoke tests.
- Should not use seeded demo data unless explicitly intended for the production demo.

Preview:

- Uses Convex preview deployments when the Vercel Preview environment has a preview deploy key.
- Preview data is fresh and isolated from production.
- Preview deployments can expire or be recreated, so old preview URLs may later show a frontend that points at a deleted Convex backend.
- Packet 10 should document and automate preview/demo seeding for smoke/E2E.

## Packet 10 Launch Gates Still Required

Before any launch readiness claim, Packet 10 still needs to verify:

- `npm test` passes.
- `npm run build` passes outside the Vercel wrapper.
- `npm run smoke:networking` exists and proves the HTTP product loop against a configured non-production endpoint.
- `npm run e2e:networking` exists and proves dashboard plus town MVP behavior in a browser.
- The dashboard can mock-claim, create/list cards, handle inbox/meeting/conversation/intro flows, and show stable error states.
- The town projection renders visible networking statuses and does not blank the Pixi canvas.
- Preview deployment smoke seeds or targets the right non-production Convex backend.
- Production Convex environment variables are configured and checked without exposing secrets.
- Convex logs show no new task-related errors after any Convex code changes.
- Replicate webhook behavior is verified or explicitly disabled if background music generation is out of scope.

## Current Non-Readiness Notes

- Packet 10 scripts are not present yet, so launch smoke/E2E is not closed.
- The existing deployment docs previously described separate Convex and Vercel deploy steps; the Vercel-compatible path is now the `build:vercel` wrapper.
- The current app can be prepared for Vercel builds, but launch readiness depends on Packet 10 verification and production/preview env setup.

## References

- Vercel Vite framework docs: https://vercel.com/docs/frameworks/frontend/vite
- Vercel build configuration docs: https://vercel.com/docs/deployments/configure-a-build
- Convex Vercel hosting docs: https://docs.convex.dev/production/hosting/vercel
- Convex HTTP Actions docs: https://docs.convex.dev/functions/http-actions
