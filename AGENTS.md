# Tabi (Min fork)

Chef's daily browser. Read `HANDOFF.md` first — it has the map, plan, and decisions.

## Rules

- When touching X features (the X/Twitter auto-file preset, container setups aimed at x.com), keep X interaction display-only: no API calls, no scraping, no automation of x.com actions.
- Baseline gates: `npm run build` must pass (green, 10 s). Upstream `npm test` (standard) is RED at 1.35.7 — 645 pre-existing errors, maintainer mode. The lint gate is therefore: zero NEW errors in files you touch. Measure with a stash-compare before/after.
- Engine updates: bump `electronVersion` in package.json, then `npm install && npm run build`. Do not vendor engine patches.
- Page-side X cleanup lives in userscripts (`js/userscripts.js` injector), never in core page hacks.
- License: Tabi as a whole is GPL-3.0 since it links `electron-chrome-extensions` (Chef approved 2026-10-20). Keep upstream Min's Apache-2.0 LICENSE/NOTICE intact for the Min-derived code.
- Commit identity: `83027938+Errnolink@users.noreply.github.com` (GH007 otherwise).
- Package the Windows zip with `npm run buildTabi` (output: `dist/app/tabi-v<version>-windows-x64.zip`).
- Build on Windows from this repo root only; node/npm at `C:\Program Files\nodejs`.
