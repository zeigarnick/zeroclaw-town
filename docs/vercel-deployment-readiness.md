# Vercel Deployment Readiness Report

Date: 2026-04-26
Status: pre-Packet 10 deployment preparation only. Do not treat this as launch readiness.

## Current Compatibility Summary

The app is a Vite React static frontend with Convex backend functions and Convex HTTP Actions. Vercel can build and serve the frontend from `dist`. Full-stack preview or production deploys must run through Convex so the frontend build receives the correct `VITE_CONVEX_URL` and the Convex functions are deployed with the same revision.

Repository config now encodes that contract:

- Vercel framework preset: `vite`
- Vercel build command: use `npm run build:vercel` when `CONVEX_DEPLOY_KEY` exists; otherwise run a frontend-only Vite build with a warning.
- Vercel output directory: `dist`
- Vercel build script: `convex deploy --cmd 'npm run build' --cmd-url-env-var-name VITE_CONVEX_URL`
- Static asset base: Vite uses `base: '/ai-town'`, with a Vercel rewrite from `/ai-town/:match*` to `/:match*`

This prepares the project for Vercel compatibility without treating a frontend-only deploy as launch-ready.

## Convex Deployment Strategy

Use one Vercel project pointing at this app root. The Vercel build command is intentionally conditional: it runs the Convex deploy wrapper when `CONVEX_DEPLOY_KEY` is set, and otherwise runs a frontend-only Vite build so pre-launch preview builds do not fail solely because Convex deploy keys have not been installed yet.

Set `CONVEX_DEPLOY_KEY` in Vercel with environment scoping:

- Production: Convex production deploy key, scoped only to Vercel Production.
- Preview: Convex preview deploy key, scoped only to Vercel Preview.
- Development: do not use the production deploy key locally; local development should continue using `.env.local` from `convex dev`.

During full-stack Vercel builds, `convex deploy` reads `CONVEX_DEPLOY_KEY`, deploys functions, sets `VITE_CONVEX_URL` for the nested `npm run build`, and the built frontend connects to that Convex deployment.

When `CONVEX_DEPLOY_KEY` is missing, Vercel only runs `npm run build`. That is acceptable for checking static build compatibility, but it does not deploy Convex functions and must not be used as launch evidence.

Preview deployments are expected to use fresh Convex preview backends. They do not share production data. Packet 10 smoke/E2E must either seed preview data or run against a known non-production endpoint.

## Required Environment Variables

Vercel build environment:

- `CONVEX_DEPLOY_KEY`: required for full-stack preview/production deploys. Use production key for Production and preview key for Preview. If omitted, Vercel runs a frontend-only build and prints a non-launch-ready warning.

Frontend build/runtime:

- `VITE_CONVEX_URL`: required by `src/components/ConvexClientProvider.tsx`, but should be provided by `convex deploy --cmd`; do not manually point production frontend at a dev deployment.
- `VITE_NETWORKING_API_BASE_URL`: optional override for dashboard HTTP calls. Leave unset for normal Vercel builds so the app derives the Convex HTTP Actions host from `VITE_CONVEX_URL`.
- `VITE_SHOW_DEBUG_UI`: optional debug flag.

Convex deployment environment:

- `OPENAI_API_KEY`: required if production AI Town initialization or agent memory uses the current OpenAI embedding configuration.
- `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL`: optional OpenAI model overrides.
- `TOGETHER_API_KEY`, `TOGETHER_CHAT_MODEL`, `TOGETHER_EMBEDDING_MODEL`: optional only if the embedding dimension/provider code is changed to Together.
- `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_EMBEDDING_MODEL`: optional custom hosted LLM configuration.
- `REPLICATE_API_TOKEN`: required only for background music generation.
- `CONVEX_SITE_URL`: required for Replicate webhooks if music generation is enabled.
- `AI_TOWN_MAP_SLICE`: optional; set to `founderCafe` only when the Founder Cafe slice has completed runtime visual QA.
- `NUM_MEMORIES_TO_SEARCH`: optional tuning value.

## Convex HTTP `/api/v1/*` Reachability

Convex HTTP Actions are defined in `convex/http.ts` with `pathPrefix: '/api/v1/'` for GET, POST, and OPTIONS.

The deployed frontend can reach these routes when `VITE_CONVEX_URL` is available because `src/networking/api.ts` derives the HTTP Actions origin by converting:

- `https://<deployment>.convex.cloud` to `https://<deployment>.convex.site`
- then appending `/api/v1`

The Convex HTTP handler sends permissive CORS headers, so browser calls from Vercel preview and production origins are allowed.

Important constraint: Vercel itself does not host `/api/v1/*` for this repo. External clients and the dashboard's default adapter should call the Convex `.convex.site/api/v1/*` origin. A same-origin `/api/v1/*` URL only works if a future Vercel rewrite/proxy is added.

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
