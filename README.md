# Tabi

Tabi is a general-purpose desktop browser built on [Min](https://github.com/minbrowser/min) (Electron, plain JavaScript) with a sea glass UI. It started as an X/Twitter-only browser and was refocused into a daily-driver browser.

What's in the box:

- Tab groups ("buckets") in a vertical sidebar, with a masonry tab overview (visual thumbnails, drag to regroup)
- Containers: run multiple logins for the same site side by side, per-tab cookie isolation
- Built-in ad, tracker, malware and phishing blocking (Ghostery engine)
- URL cleaning (tracking query params stripped), DNS over HTTPS
- Userscript manager plus Chrome Web Store extension support via electron-chrome-extensions
- Built-in PDF reader, full-text history search, tab import from Chrome/Edge/Firefox/Zen and other browsers

Honest limitations:

- No Widevine DRM, so Netflix and similar protected streams won't play
- No Google Safe Browsing; malicious-site blocking uses downloaded blocklists instead
- Extension support is partial (not every Chrome API is implemented)
- No sync; settings and data live locally
- Engine updates (Electron/Chromium) are bumped manually by editing `electronVersion` in `package.json`; the app itself updates automatically, see below

## Updating

- Each release bumps the **patch** version in `package.json`; the app checks GitHub Releases and updates itself.
- Only the NSIS-installed build (`Tabi-Setup-<version>.exe`, per-user, installs to `%LOCALAPPDATA%\Programs\Tabi`) auto-updates. The portable zip never phones home — replace the folder to update it.
- `npm run releaseTabi` builds the installer, `latest.yml`, the `.blockmap` and the portable zip into `dist/app/`, then prints the exact `gh release create` command. Append `--publish` (`npm run releaseTabi -- --publish`) to execute it. It fails if `v<version>` already exists as a tag or release — bump the version first.
- First install of the unsigned installer shows a SmartScreen "Windows protected your PC" warning: choose **More info → Run anyway**.

## Build

```
npm install
npm run build
npm start          # dev mode (alt+ctrl+r reloads the UI)
npm run buildTabi  # produces dist/app/tabi-v<version>-windows-x64.zip
```

Other upstream build scripts (`buildWindows`, `buildMacIntel`, `buildDebian`, ...) still exist but are untested for Tabi.

## Credits and license

Tabi is a fork of [Min](https://github.com/minbrowser/min), which is Apache-2.0 licensed; Min's `LICENSE` and `NOTICE` are kept intact for the Min-derived code. Because Tabi links [electron-chrome-extensions](https://github.com/samuelmaddock/electron-chrome-extensions), Tabi as a whole is licensed GPL-3.0.
