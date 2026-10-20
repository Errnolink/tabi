# xb — HANDOFF

X-focused browser fork for Chef. Min (28k LOC plain-JS Electron browser) reshaped so X browsing lives in named buckets that auto-file, collapse cold, and cost no RAM. Chef's main browsers (Chrome, Helium) go X-free.

## Why this shape

- Research 2026-10-20: `Documents/research/x-tab-organizer/FINDINGS.md` (two waves). Extension lost to the containment framing; from-scratch lost to cost; Min fork won the build lane (plain JS, Apache-2.0, Tasks feature already has named groups + collapse + session restore).
- WebKitGTK lightweight browsers are dead on Windows. Chromium forks rejected (cost).
- X interaction is display-only by design: render the real x.com, no API, no scraping, no automation. Cleanup rides the Control Panel for Twitter userscript, not page hacks.

## Fork base

- Min 1.35.7 (c92079c, 2026-08-23), shallow clone at `C:\xb`, branch `feat/buckets`.
- Upstream: maintenance mode since 2025-10 but Chromium bumps continue (v1.35.7 = Electron 43.4.1). Engine updates = bump `electronVersion` in package.json; do this monthly-ish.

## Map (what we touch)

- `js/tabState/task.js` — TaskList model (buckets): add/update/destroy, collapsed, selectedInWindow.
- `js/taskOverlay/taskOverlay.js` + `taskOverlayBuilder.js` — the bucket overlay UI (rename → bucket rail).
- `js/sessionRestore.js` — `sessionRestore.json` v2 save/restore (atomic write, per-window save owner).
- `js/webviews.js` — one BrowserView per tab; discard-inactive hook point.
- `js/userscripts.js` — built-in `@match`/`@run-at` injector; CPfT preload goes here.
- `main/` — Electron main process; app name/id/window wiring.
- `locales/` + `js/language.js` — string renames (Tasks → buckets).

## Build

```
npm install        # downloads Electron 43.4.1 binary
npm run build      # browserify bundles js/ -> main.build.js etc.
npm start          # dev run (alt+ctrl+r reloads UI)
npm run buildWindows
```

## Plan (ordered)

1. Baseline: stock dev build runs. Do not mutate before this passes.
2. Brand: productName/app name/id → xb, strip unused defaults (search providers, terminal hint, tour URL), keep Apache-2.0 LICENSE + NOTICE.
3. Buckets MVP: X-first defaults — buckets open collapsed, bucket = named group, new-tab behavior inside a bucket.
4. Auto-file: on tab create/navigation, route `x.com`/`twitter.com` URLs to the bucket whose rule matches (prefix list: profiles, lists, search, notifications...), config in a JSON the UI edits.
5. CPfT: bundle the Greasy Fork userscript, auto-registered for `x.com`.
6. Discard-inactive: when a bucket collapses or loses focus, destroy its hidden BrowserViews (tab objects keep URL; scroll position is lost — acceptable for v1), recreate on focus.
7. Package Windows (electron-builder), hand to Chef with `code`.

## Decisions log

- 2026-10-20: fork Min over qutebrowser/Electron-scratch — cheapest path to buckets, engine bumps ride upstream. Jev wave-2: use-xcolumn 0.86 / min-fork 0.11; Chef chose building over adopting. XColumn kept as UX reference only.
- 2026-10-20: scroll position not preserved across discard in v1; revisit if it annoys (Min restores session-level scroll only on session restore).
