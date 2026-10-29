# Tabi — HANDOFF

Tabi (formerly "xb") is Chef's general-purpose browser: a Min (28k LOC plain-JS Electron browser) fork with a sea glass UI, tab groups ("buckets") in a vertical sidebar, containers for multiple logins, a masonry tab overview, built-in content blocking, URL cleaning, DoH, a userscript manager and Chrome Web Store extensions. It began 2026-10-20 as an X-only browser and was refocused to general-purpose on 2026-10-21 (Chef's decision); X lives on as an optional paste-in auto-file rule set, not a default.

## Next session (from 2026-10-29)

State: branch `fix/round3` (pushed, `b6e879ef`), 10 commits on top of `feat/seaglass`: round 3 below. Not merged, not released. Chef checks the Reddit right-click first; release (2.0.1 via `npm run releaseTabi -- --publish`) only after his OK.

1. Redesign, agreed order: sidebar + toolbar → new tab page → overview → settings. Before/after screenshots of the REAL window each step (the CDP capture of the UI target has no acrylic behind it and looks brighter than reality). Needs the Tabi window visible. Done so far: ambient group light (`9690f186`).
2. Tab-opening pass: Chef sees "minor bugs when opening tabs here and there". He logs specifics in `issues.md`. Audit the paths: new tab, Ctrl/middle-click, `window.open` popups, external links, auto-file. Add regression tests there.
3. Live E2E still never run: containers (two X logins), extensions (store install of uBO + CPfT), plus the round 3 items listed as "Not exercised live".

## Why this shape

(2026-10-20 rationale for the original X-only "xb" shape; superseded for product scope by the 2026-10-21 refocus, still true for the build-lane choices.)

- Research 2026-10-20: `Documents/research/x-tab-organizer/FINDINGS.md` (two waves). Extension lost to the containment framing; from-scratch lost to cost; Min fork won the build lane (plain JS, Apache-2.0, Tasks feature already has named groups + collapse + session restore).
- WebKitGTK lightweight browsers are dead on Windows. Chromium forks rejected (cost).
- X interaction is display-only by design: render the real x.com, no API, no scraping, no automation. Cleanup rides the Control Panel for Twitter userscript, not page hacks. This still holds whenever X features are touched.

## Fork base

- Min 1.35.7 (c92079c, 2026-08-23), shallow clone at `C:\Users\Chef\Documents\Projects\tabi` (was `Projects\xb` until 2026-10-22; the verification worktree is `Projects\tabi-verify`, `node_modules` junctioned). Active branch `feat/seaglass` (from `feat/buckets`).
- Installed runtime (Chef's daily browser): NSIS install of Tabi at `%LOCALAPPDATA%\Programs\Tabi\Tabi.exe` (installed 2026-10-22 from the v2.0.0 release; Desktop, Start Menu and taskbar shortcuts point there). It updates itself from GitHub Releases. Profile `%APPDATA%\xb` is unchanged and must stay unchanged — it is pinned in `main/main.js` (`app.setPath('userData', …)`), dev mode appends `-development`. Pre-install backup of the state files: `%APPDATA%\xb\pre-tabi-2.0.0-backup\`. The old portable xb (`Apps\xb`), its shortcuts, the Desktop zips and `C:\Users\Public\xb-deploy.ps1` were removed on Chef's OK. Shipping an update = bump `version`, `npm run releaseTabi -- --publish`.
- 2026-10-21 16:14: runtime rebuilt from `feat/seaglass` (`17e46ea`), dev profile migrated (119 tabs incl. Chrome 83 and Helium · Errno 20 imports; X login in the Alt container verified live). The two profiles diverge from here: the dev profile is for testing only.
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
npm run buildTabi  # packages dist/app/tabi-v<version>-windows-x64.zip (x64 portable zip, Tabi.exe, LICENSE included)
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
- Wave 2 (`3e4863d`, `3473942`): done. Live-verified: app menu, tab menu with submenus, page right-click over x.com with Esc closing and lowering; a new container via the tab menu reopens the tab logged-out with a chip and stripe; the internal pages are restyled.
  - Menus: all menus are DOM glass (`js/glassMenu.js`, `css/glassMenu.css`) through the unchanged `remoteMenu.open` API. Main raises the UI view above the page while one is open (`raiseUIView`/`lowerUIView`; `uiViews` WeakMap replaces the old `children[0]` assumption). Extension menu items arrive via `menu-extension-items`, the app menu via `menu-app-items`, and roles via `menu-role`. The native `Menu.popup` path is gone.
  - Sidebar menus: `js/navbar/sidebarMenus.js` (tab, bucket, empty space) and the shared `js/tabActions.js`. Containers can be created inline ("New Container" gives "Account N"). The omnibox chip lives in `js/navbar/containerChip.js`.
  - Pinned tabs: `tab.pinned`, kept at the top of the bucket. Shortcuts: `togglePinTab` (Ctrl+Shift+K) and `searchTabs` (Ctrl+Shift+A, opens the overview search).
  - Masonry: `getCapture` crops the thumbnail to the focal tweet on `/status/` pages (`main article` fallback when logged out) or to the timeline column, and persists `thumbAspect`. Card height = the real post shape.
  - Caption buttons were dead because the toolbar drag region covered them; the navbar now ends at `--control-space-right`.
  - Known gap: the page menu has no Reload/Save items yet (Min's `webviewMenu` inventory only).
- Live verification is the main session's job only (agents do build + lint).
- Status 2026-10-20 late evening: wave 1 integrated. Then Chef judged it "laggy, buggy, mid", and the main session rebuilt the shell (sidebar, toolbar, overview) itself (`26e00e6`, `a9a7323`). Verified live in the dev instance: clean boot (0 errors), sidebar indicator spring, overview open/close morph (probed via `document.getAnimations()`), rail mode, auto-file with zero lost tabs across four rule targets.
- Not yet verified live: the containers E2E (two X logins side by side, survives restart) and the extensions E2E (store install of CPfT + uBO, popups). Both need Chef logged in. Both scripts are in the agents' reports.

## Issues workflow

Chef writes issues in `issues.md` (repo root), one per line, screenshots as `issues-N.png` beside it. Read it at session start. Fix each item, then log it below under "Issues log" with commit and root cause, remove it from `issues.md`, and move its screenshots to `Documents/research/xb-browser-ux/issues-<date>/`.

## Issues log

### Round 1 (2026-10-21), archived at `Documents/research/xb-browser-ux/issues-2026-10-21/`

1. Search bar dropdown looks bad. Fixed in `6e5dea4`, `32897cb`. The suggestions are a sheet anchored to the omnibox (`tabEditor.anchorSearchbar()` sets `--omnibox-left/width/bottom`; `css/searchbar.css`, `css/listItem.css`). Edit mode veils only the page card (`css/modal.css`). The dev-mode notification row is deleted. Action chips are styled; the double-quoted bucket name in `placesPlugin.js` is fixed.
2. Cannot remove the default container. Fixed in `d1e7dd3`, `4f928cf`, `32897cb`. The default is a movable role (`containers.defaultId()`, `isDefault()`, `sanitizeContainerId()`). Added a clear-data action, and delete-default with a promotion picker. Chef chose "both".
3. Overview filter view. Fixed in `6e5dea4`. Search and container chips relayout the masonry with FLIP (`overview.relayout()`, `overview.matches()`) instead of dimming. Each bucket shows "N / total". An empty filter shows "No tabs match".
4. Toolbar needs more features. Fixed in `1c22c58`, `32897cb`. Downloads are a toolbar button with a progress ring and a glass popover; the bottom bar is removed (`js/downloadManager.js`, `css/downloadManager.css`). `js/navbar/omniboxActions.js` adds: site-info popover (security, container, blocking toggle, zoom, clear site data via IPC `clearSiteData` in `main/remoteActions.js`), zoom chip, PiP/reader/copy link, bookmarks button, back/forward history on long-press or right-click. `glassMenu.openPanel()`/`begin()` host custom panels.
5. Settings and min:// pages look bad. Fixed in `4757493`. Shared sea glass sheet `pages/shared/seaglass.css`. Settings has a left nav with scroll-spy. Error, phishing, prompt, sessionRestoreError, newtab and pagebase are restyled.
6. Take features from Helium/Brave/Chrome. Research only: `Documents/research/xb-browser-ux/06-chromium-yoink.md`. Proposed pick list, NOT approved yet: Ghostery `@ghostery/adblocker-electron` built-in, Brave URL cleaning (query params, debounce, de-AMP), Helium bangs, DoH via `app.configureHostResolver`, tab hover cards, PiP auto-enter. Rejected: sync, Safe Browsing, Widevine, Cast. Chromium page freezing is not reachable from Electron.
7. Closing a bucket or tab does not update the other view. Fixed in `6e5dea4`. Root cause: the sidebar listened to `task-removed`/`tab-removed`, which do not exist; the real events are `task-destroyed`/`tab-destroyed`. The overview closed tabs in the animation `onfinish`, which raced re-renders; it now closes through `tabActions.close` at once and animates a ghost clone. Verified live: the sidebar row, model entry and card all go.
8. Ctrl/middle-click links open in the wrong bucket. Fixed in `6e5dea4`. Root cause: auto-file filed every new tab by URL rule, including link tabs, and moved them with destroy+add (a reload). Now `js/autoFile.js` files only tabs created empty (typed URLs) and moves them with `tabActions.moveToTask` without reload. Verified live: a middle-clicked link stays in its opener's bucket and container.
9. Import tabs from other browsers. Done in `af3274b`, `c2d7ac7`. `main/importTabs.js` reads Chromium SNSS sessions and Firefox mozlz4 sessions; `pages/import/*` is the picker (browser cards, tabs grouped by site with tri-state checks, filter, sticky "Into … as … Import" bar); `js/importTabs.js` creates the bucket with sleeping tabs. App menu entry opens `min://app/pages/import/index.html`. Bugs fixed in `c2d7ac7`: titles came through at half length because Pickle String16 lengths count UTF-16 units, not bytes; imported tabs were jumbled because `TabList.add` inserts after the selected tab (now `{ atEnd: true }`). Verified live: Zen import gives one "Zen" bucket with 4 tabs in source order.
10. Performance and transitions. Fixed in `cdd3d1d`, `4b85af6`. `js/uiLayer.js` is a ref-counted UI raise (`raise(reason)`/`lower(reason)`); the omnibox keeps the page live instead of capture+blur on every focus. No page captures while the window is hidden (they failed with `UnknownVizError`).
11. Tabs reload when switching back. Fixed in `6e5dea4`, `3d7c847`. Root cause: discard-inactive destroyed every view outside the selected bucket on each bucket switch. `js/discardInactive.js` now sleeps only tabs idle longer than `tabSleepMinutes` (default 60; setting 15 min / 1 h / 4 h / never), never pinned, private or audio tabs. Chef chose "keep alive, sleep after a time I set".

Also in round 1: page menu Reload/Save/Print/Copy link/View source (`575df2a`). Containers boot crash during an agent's broken edit briefly hid Chef's tabs; the session survived because `sessionRestore.save` refuses to write before restore (backup: `%APPDATA%\xb-development\sessionRestore.keep-1159.json`).

### Round 2 (2026-10-21), screenshot archived at `Documents/research/xb-browser-ux/issues-2026-10-21-r2/`

Ran as an orchestrated wave (isolated agents, merged by the main session, live-verified by separate verifier agents; reports `verify-report*.md` in the session's local dir were summarised here).

1. Userscript manager. `93842c8d`, `07408cd9`, `16697e29`, `3e04ed9e`. Store in `main/userscriptStore*.js` (userData/userscripts), manager + install prompt in `pages/userscripts/`, shared parser/matcher `js/util/userscriptMeta.js`. Granted scripts run in isolated world 977 and reach GM only through `__tabiGM__` (contextBridge) → `ipc.handle('userscript-gm-request')`, which checks main frame + @match + grant; @connect is default-deny. `document-start` scripts inject from the preload via `sendSync`; @require/@resource are fetched (https only) at install/update. Greasy Fork detects Tabi through a `window.external.Tampermonkey` stub. CPfT is a Suggested install, not auto-run. Bug fixed on the way: `loadURL(install)` inside `did-start-navigation` aborted (ERR_ABORTED); it is deferred with `setImmediate`.
2. Ghostery adblocker. `65637105`, `e0cc3bc3`. `main/adblock.js` (engine cached in userData, daily refresh, cosmetics preload per session), one `onBeforeRequest` chain in `main/filtering.js`. Old abp-filter-parser removed. With uBO installed, phishing blocking and URL cleaning keep running through webContents navigation hooks.
3. URL cleaning. `main/urlCleaning.js`: params, redirect unwrapping, de-AMP, only on main/sub-frame navigations; x.com/t.co untouched.
4. DoH. `main/secureDns.js`, setting `dnsOverHttps`, live without restart.
5. Tab hover cards. `js/navbar/tabHoverCard.js`. Stale thumbnails fixed in `0c91df3f`: every capture now bumps `thumbVersion` (temporary tab property); one store `js/thumbnailStore.js` serves hover card, overview and placeholder.
6. Merge tab groups. `0fc50489` (`tabActions.mergeTasks`).
7. PDF reader. `65d02849`, `599cc36c`. Root cause of the blank viewer: pdf.js 4 requires the viewer container to be a `<div>` (it was `<main>`); `.mjs` is served as `text/javascript`.
8. Homepage. `0e0d6f52` (`js/newTabPage/*`): wallpaper presets/upload, shortcut tiles, bookmarks, clock; favicons from the places cache, no Google favicon service.
9. Settings + performance. `4185724a`, `880c5eef`, `1ccd3a40`, `b1f8240e`. Settings rebuilt with a section per file under `pages/settings/`. Silent setting drops: the relay guard used `tabs.get(tabId)` (selected group only) and threw for internal pages in other groups; now it checks the sender frame URL, and filtering writes merge per key. Perf: no 15 s capture loop, usage-statistics writer deleted, dirty-flag session saves, lazy collapsed groups, overview opens without waiting for a capture.
10–12. Wording and containers. `cedbc5df`. "Buckets" → "Tab groups" in all UI text (code keys unchanged), inline container create (name + colour), chip popover explains containers, tooltips match real shortcuts.
13. Memory and loading. Adaptive sleep: `tabSleepMinutes` scaled ×0.25–×6 by available RAM; pressure = available < max(1 GB, 8% of total) measured with `os.freemem()` (on Windows `getSystemMemoryInfo().free` excludes standby and read < 1 GB on a 32 GB box, which killed warm-up and destroyed tabs early). Kept-alive tier (`webviews.keepAlive`) reclaimed LRU under pressure; never sleeps a tab visible in any window. Hover warm-up after 500 ms, max 2.

Also in round 2:
- Refocus to Tabi (`3e79be07`): general-purpose defaults, README/AGENTS. Repo public at `Errnolink/tabi`.
- Auto-update (`18792638`): NSIS per-user installer + electron-updater from GitHub Releases, `npm run releaseTabi [-- --publish]`. Dev and the portable zip never run the updater.
- Security: Electron 43.8.3 for the eMudhra SPKI blocklist (`24182f2e`); CSP on min:// pages; `pdf-file` endpoint only serves local drive PDFs to the viewer; Electron fuses (RunAsNode, NODE_OPTIONS, inspect args off) in packaged builds only.
- Google sign-in (`38c41ac5`): plain Chrome UA everywhere; on accounts.google.com a full Firefox persona (header UA, `webContents.setUserAgent`, no Sec-CH-UA, `navigator.userAgentData` removed by a preload). Google also rate-limits repeated automated attempts with a CAPTCHA; that is risk scoring, not the browser.
- X layout split-brain (`ca2e8881`): interrupting Electron's animated `setBounds` with a view swap wedged the renderer's size, so X laid out for the wrong width. `main/viewManager.js` runs its own cancelable tween now.
- Audit (`local audit.md`, 62 findings) fixed in slices A–F + consolidation: permission chip (camera/mic/notifications prompts were never shown), tabAudio re-wired (mute, PiP, audio exemption), view events for tabs in other groups, focus no longer stolen by hover/menus, Clear browsing data (Ctrl+Shift+Delete), default-browser row, Chrome shortcuts, persistent downloads (Ctrl+J), auto-file rules editor with X preset, bounded quit (`e6413c22`), unit tests `npm run test:unit` (node:test, 56 tests), large files split into modules.

### Round 3 (2026-10-29, branch `fix/round3`): beta polish, scope left to Ciel by Chef

1. Page flicker on right-click (a friend's report on Reddit). Fixed in `d2ca1f56`. Root cause: `uiLayer.raise()` added `body.ui-raised` (which makes the UI transparent over the page) and sent `menu-raise` in the same tick. So main stacked the UI view above the page before the renderer painted the transparent frame, and the opaque backdrop plus blurred placeholder covered the page for a frame or two. `lower()` did the reverse. The same race hit every context menu, omnibox focus and tab hover card. Now: raise paints transparent first (two rAFs), then adds `ui-on-top` and raises. Lower awaits `ipc.invoke('menu-lower')` and only then repaints opaque. `#menu-layer` stays hidden until `ui-on-top`.
2. Page context menu is context-aware like Chrome (`d2ca1f56`). Page items (Back/Forward with real enabled state, Reload, Save/Print/Copy Link, Translate, View Source) only on empty page. Links get Copy Link Address. Images get Copy Image and Copy Image Address. Text fields get Undo/Redo/Cut/Copy/Paste/Paste and Match Style/Select All from `editFlags`. Selection shows "Search with X “…”". The duplicate Copy Link is gone.
3. Bug sweep (`local bug-sweep.md`, 15 findings), fixed in `9f976004` (renderer) and `138c827d`…`efc573d4` (main):
   - uBlock Origin used to disable all network blocking in its container: Electron only proxies extension webRequest when a session has zero listeners, and download/UA listeners always exist. Ghostery now always stays on; the extension-blocker handoff path is deleted. Supersedes the 2026-10-20 decision that Min's filter turns off with uBO.
   - Closing a tab in a non-current group (sidebar ×, middle-click, `window.close()`, extensions) did nothing: `browserUI.closeTab` only searched the current group. It now closes in any group, and `tabActions.close` delegates to it.
   - Site-info popover on a private tab cleared the Default container's data; private tabs no longer show the container row or Clear site data.
   - Reload/Reader view on a sleeping tab threw a main-process error dialog: `webviews.update` now writes the URL to the model when there is no view, and main's `loadURLInView` ignores unknown ids.
   - Address bar right-click Cut/Copy/Paste acted on the page: UI-input menu roles carry `target: 'ui'` and keep focus in the input.
   - Private tabs no longer load every extension into their own session; deleting a container tears down its extension instance (`extensionsTeardownPartition`; HANDOFF open item 1).
   - Editing an auto-file rule kept moving it to the end (first-match order broke the X preset); edits now happen in place.
   - Container changes reloaded private tabs and dangling-`'default'` tabs; rehome now only recreates views whose resolved partition changed, skips private tabs, and clears dangling group default containers (auto-file into that group works again).
   - Overview cards kept first-seen thumbnails; the cache evicts on thumb/url/favicon/container changes while hidden.
   - Low: an empty shortcut list stays empty, removing a download persists, the update toast is a toolbar pill (UI DOM over the page is invisible), the blank shield menu item is removed, missing locale keys are added, and the container delete warning names the real default (HANDOFF open item 2: the label was untranslated, not stale).
   - Boot `MaxListenersExceededWarning`: single-shot `ready` hooks use `app.whenReady()`.
4. Design: ambient group light. The active tab group's hue (`--ambient-hue`, `@property`, 900 ms glide) tints a frosted glow behind the chrome, the page card rim and shadow, and the menu highlight.
5. Follow-ups found in live testing (`9690f186`): Chromium pauses rAF in occluded windows, so the raise never fired and menus stayed invisible; `afterPaint` now also fires after a 50 ms timer (about 1 s when the window is hidden, because of timer throttling). History calls in `callViewMethod` go through `webContents.navigationHistory` (deprecation warnings gone).

Live-verified 2026-10-29 in the dev instance over CDP:
- Raise/lower ordering on every menu cycle: `#webviews` is transparent before `menu-raise`, and `ui-raised` is removed only after `menu-lower` resolves.
- Menus per context: page, image-in-link, selection, text field.
- Page text-field roles: Select All → Cut → Paste.
- Omnibox roles edit the omnibox and leave the page field untouched.
- Closing a tab in a non-current group: the row and page target are gone.
- Hue glide from 150 to 278 on a group switch.
- No boot warning and no deprecation lines.

Not exercised live:
- uBO + Ghostery (no extension installed).
- Container delete/teardown and rehome.
- Private-tab site info and extensions.
- The sleeping error-page reload (Reload All on a normal sleeping group ran clean).
- Rule edit order, overview cache, shortcuts/downloads persistence, the update pill.

There is still no visual proof that the flicker is gone, only the ordering proof. Chef's eye on Reddit is the check.

### Open

- Installer is unsigned (Chef declined paid signing): first install shows SmartScreen "More info → Run anyway"; update trust rests on the GitHub account.
- `crx-msg-remote: undefined is not a registered handler` from the extension toolbar once per UI load (electron-chrome-extensions `browser-action-list` `getState`); not root-caused.

## Dev instance notes

- Run `node_modules/electron/dist/electron.exe . --development-mode --remote-debugging-port=9333` from the repo root. Profile: `%APPDATA%\xb-development`. Restart after any `main/*` change.
- Reload the UI target `min://app/index.html` with CDP `Page.reload {ignoreCache: true}`. A plain reload can keep running a cached old `dist/bundle.js`.
- Keyboard shortcuts cannot be sent as CDP key events to the UI. Use `ipc.emit('before-input-event', {}, {type: 'keyDown', key, code, control, shift, alt: false, meta: false, isAutoRepeat: false, modifiers: [...]})`.
- Open an internal page from the UI context with `ipc.emit('addTab', {}, {url: 'min://app/pages/…'})`.
- `main/*.js` is concatenated into one scope (`scripts/buildMain.js`): run `node --check main.build.js` after a build; top-level names must not collide.
- Never reload the UI or restart xb while an agent has uncommitted or broken code.
- The UI bundle is browserify: `require('x.js')` from CDP fails. Drive tests through DOM + CDP input on the UI and page targets, and wrap the global `ipc.send`/`ipc.invoke` for ordering logs. Read hidden menu text with `textContent`, not `innerText`.
- When the Tabi window is occluded or minimized, Chromium pauses rAF and throttles timers to about 1 s. Menus then open slowly, and window screenshots fail; `Page.captureScreenshot` on the UI target still works, but without the acrylic behind it.

## Decisions log

- 2026-10-20: fork Min over qutebrowser/Electron-scratch — cheapest path to buckets, engine bumps ride upstream. Jev wave-2: use-xcolumn 0.86 / min-fork 0.11; Chef chose building over adopting. XColumn kept as UX reference only.
- 2026-10-20: scroll position not preserved across discard in v1; revisit if it annoys (Min restores session-level scroll only on session restore).
- 2026-10-20: rename verified by dev boot — window brands as xb, first run opens x.com (AX-verified login wall rendered, stderr clean). Known leak: window title suffix `| Min` is hardcoded somewhere in the UI (find `| Min` / title setter); fix during buckets work. Screenshots of the occluded window come out black — Chromium layers don't composite into capture; verify via AX tree or by focusing, not by pixel color.
- 2026-10-20: title leak fixed (browserUI.js uses `globalArgs['app-name']`); Tasks→Buckets strings live in en-US.json (keys unchanged, code refs intact); startup default flipped to reopen-last-task (option 1) — verified live: restart restores `Home / X | xb` with Chef's login from the persisted cookie store (`%APPDATA%/xb-development`). Dev-profile login: Chef logged in 2026-10-20; packaged build will need one fresh login (separate userData).
- 2026-10-20: vertical bucket rail (`js/bucketRail.js` + `css/bucketRail.css`): fixed left column listing every bucket and its tabs, click-to-switch, re-rendered on all task/tab events. Coupling: `webviews.getViewBounds()` reads `body.rail-on` + `#bucket-rail` offsetWidth and insets the x axis — any layout change to the rail width must stay in ONE place (RAIL_WIDTH const + CSS width). Verified live (screenshot: rail renders, page docks right of it, `Home / X | xb`). Old stored tab titles (e.g. `Preferences | Min`) refresh on next page load.
- 2026-10-20: auto-file (`js/autoFile.js`) committed — first-match prefix rules in `%APPDATA%/xb-development/autofile.json` (seeded Home/Search/Reading), hooks `tab-added` + `tab-updated(url)` debounced 250 ms, arms 3 s after boot to stay clear of session restore, moves with the customBangs destroy+add sequence, view follows a moved selected tab. Behavioral E2E pending: Chef types `x.com/search?q=test` in the address bar; expect a new Search bucket and title ending `| Search | xb`.
- 2026-10-20: auto-file v2 (`88adff9`) — SPA in-view navigation no longer re-files the viewed tab (root cause of Chef's "breaking on tweet click": every pushState yanked + reloaded the live view). Only young tabs file; young clears on first real URL. New E2E: NEW tab → x.com/search?q=test → settles into Search bucket.
- 2026-10-20: Control Panel for Twitter bundled (`84749a4`): script lives at `ext/userscripts/control-panel-for-twitter.user.js` (Greasy Fork v220, MIT, keep header for attribution); `main.js` passes `--app-path`; `userscripts.js` loadScripts() reads `ext/userscripts/` synchronously before the user-dir scan. Verify by eye on the Home / X tab (Following-forced timeline, promoted/upsell hidden).
- 2026-10-20: discard-inactive (`js/discardInactive.js`), superseded 2026-10-21 (issue 11): views now sleep only after `tabSleepMinutes` idle, not on bucket switch. Skips pinned, private and `tab.hasAudio` tabs. Views recreate lazily via setView; scroll restored from tab state.
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
- 2026-10-21: refocus xb → Tabi (Chef decision): same engine lane, general-purpose product. package.json `name` `tabi` / `productName` `Tabi` (exe `Tabi.exe`, version stays 1.35.7, repository → Errnolink/tabi); `buildXb` → `buildTabi` (`scripts/buildTabi.js`, zip `tabi-v<version>-windows-x64.zip`). CRITICAL: `%APPDATA%\xb` (+ `-development` in dev) is pinned via `app.setPath('userData', path.join(app.getPath('appData'), 'xb'))` at the top of `main/main.js`, BEFORE `crashReporter.start` and before the dev-mode append, so Chef's tabs and logins survive the rename — do not "fix" that path to `tabi`. First run opens an empty new tab (homepage overlay), not x.com (`js/sessionRestore.js`). Auto-file ships with NO rules and writes `autofile.json` only when the file is missing/unparseable, never on unchanged boots (`js/autoFile.js`); the engine is host-agnostic now; the old X rule set (Home/Search/Reading) is retired to git history as a paste-in preset — no rules editor UI exists, none was built. X-only defaults removed (new-tab X shortcut, Min→Tabi in registry/installer metadata, `min:` host label, drag MIME type, view-transition name, about/version strings, en-US + page copy); `urlCleaning.js` still exempts x.com/twitter.com/t.co from param stripping (protective, kept). README rewritten, AGENTS retitled "Tabi (Min fork)". Existing `%APPDATA%` profiles are untouched.
- 2026-10-22: Tabi has its own version line starting at 2.0.0. Reason: the repo carries Min's upstream tags (`v1.35.7` etc.), so `v1.35.x` collided with `releaseTabi`'s tag check and would keep colliding with future Min tags. Release = bump `version` (patch for fixes), `npm run releaseTabi -- --publish`. First public release `v2.0.0` on Errnolink/tabi (installer + latest.yml + blockmap + portable zip). The installed daily xb at `Apps\xb` is not the NSIS install: Chef moves to Tabi-Setup when ready (profile `%APPDATA%\xb` is shared, nothing to migrate). Google sign-in: the Firefox persona is verified live (UA, no client hints, no userAgentData, `window.chrome` undefined), yet Google still returned "browser may not be secure" for the test address on 2026-10-22 after a day of automated attempts; Chef signed in manually earlier. Treat further failures as Google risk scoring until a clean manual retest says otherwise.
- 2026-10-22: The v2.0.0 portable zip was uploaded ~226 KB short (7-Zip: "Unexpected end of data"). Cause: `scripts/buildTabi.js` returned before the zip stream closed; the fix makes it await the close. Asset re-uploaded and verified: 1,481 files extract clean.
