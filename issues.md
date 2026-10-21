# xb issues

Add one issue per line. Screenshots go next to this file as `issues-N.png`, embedded with `![](issues-N.png)`.
Fixed issues move to `HANDOFF.md` (Issues log) with their commit, and their screenshots are archived.

## Open

1. Userscript manager (Tampermonkey replacement), built on `js/userscripts.js`: install from Greasy Fork or any `.user.js` link with an install prompt, a manager page with on/off switches, the common `GM_*` APIs, auto-update. Move Control Panel for Twitter from the bundled file to an installed script. Keep extension support.
2. Built-in adblocker: Ghostery `@ghostery/adblocker-electron` (network blocking, cosmetic filters, scriptlets) in every container session.
3. URL cleaning (from Brave): strip tracking params (`utm_*`, `fbclid`, …), skip tracking redirects (debounce), de-AMP.
4. Encrypted DNS (DoH) via `app.configureHostResolver`, with a setting.
5. Tab hover cards: hovering a sidebar tab shows a preview card with thumbnail, title and URL.
6. Merge buckets: "Merge into…" in the bucket menu moves every tab into the chosen bucket, then removes the empty one.
7. pdf reader
8. good homepage, with wallpaer, bookmarks, quick shortcuts ![](issues-1.png)\
   my friends new tab page kinda looks like this so yeah
9. performace optimistions, and fix settings page cause it looks ass and idk if the features actually work either
10. "Buckets" is confusing: rename to tab groups (the words a Chrome or Brave user already knows).
11. Container actions should be more user friendly.
12. Most features are hard for a new user to understand, especially one coming from Brave.
