# xb (Min fork)

Chef's X-bucket browser. Read `HANDOFF.md` first — it has the map, plan, and decisions.

## Rules

- Keep X interaction display-only: no API calls, no scraping, no automation of x.com actions.
- Baseline before mutation: stock `npm run build && npm start` must pass before any feature work on a fresh clone.
- Engine updates: bump `electronVersion` in package.json, then `npm install && npm run build`. Do not vendor engine patches.
- Page-side X cleanup lives in userscripts (`js/userscripts.js` injector), never in core page hacks.
- License stays Apache-2.0; keep upstream LICENSE/NOTICE intact.
- Commit identity: `83027938+Errnolink@users.noreply.github.com` (GH007 otherwise).
- Build on Windows from this repo root only; node/npm at `C:\Program Files\nodejs`.
