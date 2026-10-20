# xb — HANDOFF

X-focused browser fork for Chef. Min (28k LOC plain-JS Electron browser) reshaped so X browsing lives in named buckets that auto-file, collapse cold, and cost no RAM. Chef's main browsers (Chrome, Helium) go X-free.

## Why this shape

- Research 2026-10-20: `Documents/research/x-tab-organizer/FINDINGS.md` (two waves). Extension lost to the containment framing; from-scratch lost to cost; Min fork won the build lane (plain JS, Apache-2.0, Tasks feature already has named groups + collapse + session restore).
- WebKitGTK lightweight browsers are dead on Windows. Chromium forks rejected (cost).
- X interaction is display-only by design: render the real x.com, no API, no scraping, no automation. Cleanup rides the Control Panel for Twitter userscript, not page hacks.

## Fork base

- Min 1.35.7 (c92079c, 2026-08-23), shallow clone at `C:\Users\Chef\Documents\Projects\xb` (moved from `C:\xb` on 2026-10-20; node_modules moved with it), branch `feat/buckets`. Installed runtime (the packaged zip, separate from this repo): `C:\Users\Chef\Apps\xb` — update it with `C:\Users\Public\xb-update.ps1 <zip>`.
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
npm start          # dev run (alt+ctrl+r reloads the UI)
npm run buildXb    # packages dist/app/xb-v<version>-windows-x64.zip (x64 portable zip, LICENSE included)
```

## Plan (ordered)

1. Baseline: stock dev build runs. Do not mutate before this passes.
2. Brand: productName/app name/id → xb, strip unused defaults (search providers, terminal hint, tour URL), keep Apache-2.0 LICENSE + NOTICE.
3. Buckets MVP: X-first defaults — buckets open collapsed, bucket = named group, new-tab behavior inside a bucket.
4. Auto-file: on tab create/navigation, route `x.com`/`twitter.com` URLs to the bucket whose rule matches (prefix list: profiles, lists, search, notifications...), config in a JSON the UI edits.
5. CPfT: bundle the Greasy Fork userscript, auto-registered for `x.com`.
6. Discard-inactive: when a bucket collapses or loses focus, destroy its hidden BrowserViews (tab objects keep URL; scroll position is lost — acceptable for v1), recreate on focus.
7. Package Windows (electron-builder), hand to Chef with `code`.

## Plan: sea glass overhaul (branch `feat/seaglass`, from 2026-10-20)

Research: `Documents/research/xb-browser-ux/FINDINGS.md` (+ 01–05, inspo/). Chef's design target: @blueemi99's "sea glass" Material concept (frosted pastel pebbles, grain, tinted pointer-lit shadows).

- Wave 1 (parallel, file ownership in the session contract): Shell (Gemini): tokens, acrylic window, thin toolbar, sidebar replacing the tab strip and bucket rail. Containers (GLM): per-tab partitions, registry, manager page. Extensions (GLM): electron-chrome-extensions per container, Web Store, toolbar actions. Overview (Gemini): disk thumbnails, masonry overview replacing the task overlay, view transitions.
- Wave 2 (not started): sea-glass DOM menus (UI view raised above pages while open) with the full tab, bucket, link and image inventory; missing shortcuts (pin, tab search, Ctrl+1..9); container actions in the sidebar menus (`containers.reopenTabInContainer` / `setBucketDefault` exist, no UI yet).
- Live verification is the main session's job only (agents do build + lint).
- Status 2026-10-20 late evening: wave 1 integrated. Then Chef judged it "laggy, buggy, mid", and the main session rebuilt the shell (sidebar, toolbar, overview) itself (`26e00e6`, `a9a7323`). Verified live in the dev instance: clean boot (0 errors), sidebar indicator spring, overview open/close morph (probed via `document.getAnimations()`), rail mode, auto-file with zero lost tabs across four rule targets.
- Not yet verified live: the containers E2E (two X logins side by side, survives restart) and the extensions E2E (store install of CPfT + uBO, popups). Both scripts are in the agents' reports. Packaged build (`C:\Users\Chef\Apps\xb`) not rebuilt from this branch.

## Decisions log

- 2026-10-20: fork Min over qutebrowser/Electron-scratch — cheapest path to buckets, engine bumps ride upstream. Jev wave-2: use-xcolumn 0.86 / min-fork 0.11; Chef chose building over adopting. XColumn kept as UX reference only.
- 2026-10-20: scroll position not preserved across discard in v1; revisit if it annoys (Min restores session-level scroll only on session restore).
- 2026-10-20: rename verified by dev boot — window brands as xb, first run opens x.com (AX-verified login wall rendered, stderr clean). Known leak: window title suffix `| Min` is hardcoded somewhere in the UI (find `| Min` / title setter); fix during buckets work. Screenshots of the occluded window come out black — Chromium layers don't composite into capture; verify via AX tree or by focusing, not by pixel color.
- 2026-10-20: title leak fixed (browserUI.js uses `globalArgs['app-name']`); Tasks→Buckets strings live in en-US.json (keys unchanged, code refs intact); startup default flipped to reopen-last-task (option 1) — verified live: restart restores `Home / X | xb` with Chef's login from the persisted cookie store (`%APPDATA%/xb-development`). Dev-profile login: Chef logged in 2026-10-20; packaged build will need one fresh login (separate userData).
- 2026-10-20: vertical bucket rail (`js/bucketRail.js` + `css/bucketRail.css`): fixed left column listing every bucket and its tabs, click-to-switch, re-rendered on all task/tab events. Coupling: `webviews.getViewBounds()` reads `body.rail-on` + `#bucket-rail` offsetWidth and insets the x axis — any layout change to the rail width must stay in ONE place (RAIL_WIDTH const + CSS width). Verified live (screenshot: rail renders, page docks right of it, `Home / X | xb`). Old stored tab titles (e.g. `Preferences | Min`) refresh on next page load.
- 2026-10-20: auto-file (`js/autoFile.js`) committed — first-match prefix rules in `%APPDATA%/xb-development/autofile.json` (seeded Home/Search/Reading), hooks `tab-added` + `tab-updated(url)` debounced 250 ms, arms 3 s after boot to stay clear of session restore, moves with the customBangs destroy+add sequence, view follows a moved selected tab. Behavioral E2E pending: Chef types `x.com/search?q=test` in the address bar; expect a new Search bucket and title ending `| Search | xb`.
- 2026-10-20: auto-file v2 (`88adff9`) — SPA in-view navigation no longer re-files the viewed tab (root cause of Chef's "breaking on tweet click": every pushState yanked + reloaded the live view). Only young tabs file; young clears on first real URL. New E2E: NEW tab → x.com/search?q=test → settles into Search bucket.
- 2026-10-20: Control Panel for Twitter bundled (`84749a4`): script lives at `ext/userscripts/control-panel-for-twitter.user.js` (Greasy Fork v220, MIT, keep header for attribution); `main.js` passes `--app-path`; `userscripts.js` loadScripts() reads `ext/userscripts/` synchronously before the user-dir scan. Verify by eye on the Home / X tab (Following-forced timeline, promoted/upsell hidden).
- 2026-10-20: discard-inactive (`js/discardInactive.js`): sweeps WebContentsViews of all tabs outside the selected bucket on bucket switch (1.5 s debounce) and every 60 s; skips private tabs and `tab.hasAudio`. Views recreate lazily via setView; scroll restored from tab state. Live from next app start.
- 2026-10-20: subagent-spawned processes do not reliably outlive the subagent kernel — the RailPolish agent's "verified" instance died with its session while its windowless tree held the profile singleton lock, silently bouncing later launches (electron exits code 0 immediately). Recovery: `cmd /c "taskkill /F /IM electron.exe"` (xb-only; chrome.exe untouched) then relaunch from the main session. Rule: the main session owns the dev instance lifecycle; agents verify by build+lint+code inspection only.
- 2026-10-20: overhaul decisions (Chef, via ask). Thin top toolbar, not an omnibox in the sidebar. Containers per tab, with a bucket default container (no x.com site rules: every account shares one domain). Night sea glass follows the dark-mode setting. Sea-glass DOM menus, not native ones. Extensions via electron-chrome-extensions: xb becomes GPL-3.0 (package.json + AGENTS.md updated in `d81e701`). Gemini agents run through `~/.omp/agent/agents/gemini.md` (gemini-3.1-pro, fallback 3.8-flash). The agent cap was raised to 4 for this work.
- 2026-10-20: platform facts that shape the design. Pages are native views above the UI DOM, so glass is DWM acrylic on chrome only, and DOM menus need the UI view raised. CSS masonry (`grid-lanes`) is unshipped in Chromium 150, so the overview uses JS masonry. `View.setBounds(bounds, {animate})` exists in 43.4.1 (verified in `electron.d.ts`). uBlock Origin MV2 works, but Min's own `session.webRequest` filter must turn off when it is installed. uBO Lite is broken (static DNR rules never load).
- 2026-10-20: extensions slice (`763fc4f`, `fee961c`, `80b47cc`). One `ElectronChromeExtensions` per container partition (`main/extensions.js`, created from `onContainerPartitionAdded`), all sharing `userData/Extensions`; `installChromeWebStore({minimumManifestVersion: 2, autoUpdate: false})` per session so MV2 uBlock Origin installs and 'Add to Chrome' works in any container. Updates are manual (management page button) to avoid N sessions racing the shared install dir. Tab model routing: `createTab`/`selectTab`/`removeTab` send IPC to the UI renderer (`extension-create-tab`/`-select-tab`/`-close-tab`, handled in `js/extensionsToolbar.js`) and reply via `extension-tab-created` + view polling; viewManager hooks register/deregister each view with its session's instance and call `selectTab` from `setView`. `crx://` handled on defaultSession (toolbar icons) and every container session (management page icons). Toolbar: `injectBrowserAction` loaded via runtime `window.require` of `electron-chrome-extensions/browser-action` (browserify's transforms skip node_modules, so a bundled require pulled in the npm electron package instead of the API — must stay a runtime require), element mounted into `#toolbar-actions`, `partition`/`tab` attributes follow the selected tab's container; private tabs hide the list. Extension context menus merge in `main/remoteMenu.js` from real `MenuItem`s — webviewMenu passes `{tabId, contextMenuParams}` as the 4th `remoteMenu.open` arg (Containers, `7a44507`), so the path is fully wired. Filtering handoff: `main/filtering.js` `setExtensionWebRequestBlocker` (exported on global) unregisters Min's `onBeforeRequest` for any session with an extension declaring `webRequestBlocking`; settings page shows a notice (dynamic via the view-preload `extensionsRequest` relay, which also serves `pages/extensions/`). Known limits: no `requestPermissions` impl (optional_permission flows fail), `chrome.windows.create` ignores per-window details, newtab overrides not honored, extension menu items appear at menu bottom, CPfT exists both as bundled userscript and store extension (disable one to avoid double-cleanup on x.com).
- 2026-10-20: wave-1 integration blockers. Symptom: the app would not boot. Causes, each fixed in the main session:
  1. Two main files declared `pathToFileURL` in the concatenated main scope.
  2. Stock Min never defines `path` in main.
  3. `js/navbar/addTabButton.js` was still bound to a deleted button.
  4. `extensionsToolbar` touched `tabs` before restore, and used a nonexistent `tabs.on`.
  5. Browserify bundled the npm `electron` stub through `window.require('…browser-action')`. Fix: `instance.exclude('electron-chrome-extensions/browser-action')` in `scripts/buildBrowser.js` plus the exports subpath.
  The crashed boots saved an empty session over `%APPDATA%/xb-development/sessionRestore.json`, which lost the dev-profile tab list (cookies intact). Fix: `sessionRestore.save` refuses to write before `restore()` completes (`9feb554`).
- 2026-10-20: shell rebuild (`26e00e6`). Symptom: lag, dead hover states, no animation. Cause: the agent sidebar did `innerHTML = ''` and rebuilt every row plus dragula on every `tab-updated` event (dozens per page load). Fix: keyed renderer in `js/navbar/tabBar.js` (row-level updates; structural renders batched per frame), one `.sidebar-indicator` pebble moved with a CSS spring, FLIP on reorder, enter/exit animations, SortableJS with built-in animation. Dragula is removed from the deps.
- 2026-10-20: layout single source of truth is `js/shellLayout.js`. It owns toolbar height, gutter, page radius, sidebar/rail width and bucket hues. It writes the CSS vars, and `webviews.getViewBounds()` reads `pageRect()`. Pages are an inset rounded card (`View.setBorderRadius`, radius sent with every `setView`/`setBounds`). Sidebar collapse animates the native view with `setBounds(…, {animate})`.
- 2026-10-20: loading state = `webviews.loadingTabs` (did-start/stop-loading). The stuck "stop" button came from `tab.loaded === false` on new-tab pages.
- 2026-10-20: overview (`js/overview/overview.js`, `css/overview.css`) replaces the Min task overlay.
  - Thumbnails are read from `userData/thumbnails/<tabId>.jpg` via fs → blob URLs (the UI origin cannot load file://).
  - x.com profiles and statuses get tall 4:5 cards (masonry rhythm).
  - Page↔card morph: `startViewTransition` with `view-transition-name: xb-page` on the placeholder and the card thumb.
  - Morph gotchas fixed in `a9a7323`: the target card needs `content-visibility: visible`; the overview must be unhidden before `render()` measures columns; the active tab needs a fresh `previewImage` before the swap (`freshPreview`, ≤300 ms).
  - CDP `Page.captureScreenshot` and gdigrab cannot show view transitions (DOM state / black occluded window). Verify via `document.getAnimations()` pseudo-element keyframes.
- 2026-10-20: auto-file data loss, two causes, both fixed in `26e00e6`.
  1. `taskForRule` returned `tasks.add()` (an id) instead of the task, so the first tab filed into a NEW bucket threw after being destroyed in its source. Present since `59b7164`, so the packaged build has it.
  2. electron-chrome-extensions calls the `removeTab` impl for every tab it stops tracking, including xb's own view destroys, so the extension close-IPC closed moved tabs. Fix: `extensionsReleasingViews` WeakSet. Its `selectTab` impl also echoed xb's own notifications back into a UI tab switch; fixed with the `extensionsNotifying` guard.
