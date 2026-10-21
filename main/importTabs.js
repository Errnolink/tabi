/*
Tab import from other browsers. Detects installed Chromium-family and
Firefox-family profiles on Windows, parses their session files (SNSS commands
and mozLz4) into open-tab lists, and serves them to the min://app/pages/import
page. The final import is relayed to the UI window where js/importTabs.js
creates buckets and tabs without views.

SNSS format (verified against components/sessions/core/{session_command,
session_service_commands,base_session_service_commands,command_storage_backend}.cc
and against local Chrome 155 / Edge 155 / Helium 155 profiles):
  header: "SNSS" + int32 version (3 = cleartext with marker)
  then commands: [uint16 size][uint8 command id][payload], size includes the id
  struct payloads are packed little-endian; kCommandUpdateTabNavigation (6)
  wraps a base::Pickle: [uint32 pickle payload size][int32 tab id][int32 nav
  index][string url][string16 title][...], where strings are uint32 byte
  length + bytes and every variable-length write is padded to 4 bytes.
  Session_<timestamp> files hold the live session; Tabs_<timestamp> files hold
  the recently-closed tab list and are ignored.
*/

/* global fs, path, ipc, app, windows, sendIPCToWindow, containerRegistry */

;(function () {
  var localAppData = process.env.LOCALAPPDATA
  var roamingAppData = process.env.APPDATA

  var CHROMIUM_BROWSERS = [
    { id: 'chrome', name: 'Google Chrome', base: ['Google', 'Chrome', 'User Data'] },
    { id: 'edge', name: 'Microsoft Edge', base: ['Microsoft', 'Edge', 'User Data'] },
    { id: 'helium', name: 'Helium', base: ['imput', 'Helium', 'User Data'] },
    { id: 'brave', name: 'Brave', base: ['BraveSoftware', 'Brave-Browser', 'User Data'] },
    { id: 'vivaldi', name: 'Vivaldi', base: ['Vivaldi', 'User Data'] },
    { id: 'opera', name: 'Opera', base: [], flatProfile: 'Opera Stable', roaming: true }
  ]

  var FIREFOX_BROWSERS = [
    { id: 'firefox', name: 'Firefox', root: ['Mozilla', 'Firefox'] },
    { id: 'zen', name: 'Zen Browser', root: ['zen'] }
  ]

  var CHROMIUM_PREFIX = 'chromium:'
  var FIREFOX_PREFIX = 'firefox:'

  /* ---------- SNSS ---------- */

  function isImportableURL (url) {
    return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url)
  }

  function readSNSSCommands (buf) {
    if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'SNSS') {
      throw new Error('not an SNSS file')
    }
    if (buf.readInt32LE(4) !== 3) {
      throw new Error('unsupported SNSS version')
    }
    var commands = []
    var off = 8
    while (off + 3 <= buf.length) {
      var size = buf.readUInt16LE(off)
      if (size < 1 || off + 2 + size > buf.length) {
        break // truncated tail, keep what we have
      }
      commands.push({ id: buf[off + 2], payload: buf.subarray(off + 3, off + 2 + size) })
      off += 2 + size
    }
    return commands
  }

  // reads one Pickle-style string; returns null instead of throwing on a
  // truncated command (Chromium truncates oversized payloads)
  function pickleString (buf, pos, utf16) {
    if (pos + 4 > buf.length) return null
    var len = buf.readUInt32LE(pos) * (utf16 ? 2 : 1)
    pos += 4
    if (pos + len > buf.length) return null
    var str = buf.toString(utf16 ? 'utf16le' : 'utf8', pos, pos + len)
    pos = (pos + len + 3) & ~3
    return { str: str, pos: pos }
  }

  function replaySNSS (commands) {
    var closedWindows = new Set()
    var tabs = new Map()
    function tab (id) {
      var t = tabs.get(id)
      if (!t) {
        t = { windowId: 0, visual: 0, navs: new Map(), current: -1 }
        tabs.set(id, t)
      }
      return t
    }
    for (var i = 0; i < commands.length; i++) {
      var c = commands[i]
      var p = c.payload
      try {
        switch (c.id) {
          case 0: // kCommandSetTabWindow [window][tab]
            if (p.length >= 8) tab(p.readInt32LE(4)).windowId = p.readInt32LE(0)
            break
          case 2: // kCommandSetTabIndexInWindow [tab][visual index]
            if (p.length >= 8) tab(p.readInt32LE(0)).visual = p.readInt32LE(4)
            break
          case 6: { // kCommandUpdateTabNavigation (pickle)
            // p[0..3] is the Pickle header (payload size); skip it
            var pos = 4
            if (p.length < 12) break
            var tabId = p.readInt32LE(pos)
            var navIndex = p.readInt32LE(pos + 4)
            pos += 8
            var urlRes = pickleString(p, pos, false)
            if (!urlRes) break
            var titleRes = pickleString(p, urlRes.pos, true)
            tab(tabId).navs.set(navIndex, { url: urlRes.str, title: titleRes ? titleRes.str : '' })
            break
          }
          case 7: // kCommandSetSelectedNavigationIndex [tab][index]
            if (p.length >= 8) tab(p.readInt32LE(0)).current = p.readInt32LE(4)
            break
          case 16: // kCommandTabClosed [id][int64 close time]
            if (p.length >= 4) tabs.delete(p.readInt32LE(0))
            break
          case 17: // kCommandWindowClosed
            if (p.length >= 4) closedWindows.add(p.readInt32LE(0))
            break
        }
      } catch (e) {
        // malformed command payload: skip it, keep the rest of the session
      }
    }
    // group live tabs with navigations under their windows, in window/tab id
    // order (ids increment, so this approximates creation order)
    var result = []
    var windowIds = [...new Set([...tabs.values()].map(function (t) { return t.windowId }))]
      .filter(function (wid) { return wid !== 0 && !closedWindows.has(wid) })
      .sort(function (a, b) { return a - b })
    for (var wi = 0; wi < windowIds.length; wi++) {
      var wid = windowIds[wi]
      var tabEntries = [...tabs.entries()]
        .filter(function (entry) { return entry[1].windowId === wid && entry[1].navs.size > 0 })
        .sort(function (a, b) { return (a[1].visual - b[1].visual) || (a[0] - b[0]) })
      var tabList = []
      for (var ti = 0; ti < tabEntries.length; ti++) {
        var entry = tabEntries[ti]
        var navs = entry[1].navs
        var idx = navs.has(entry[1].current) ? entry[1].current : Math.max(...navs.keys())
        var nav = navs.get(idx)
        if (isImportableURL(nav.url)) {
          tabList.push({ url: nav.url, title: nav.title || nav.url })
        }
      }
      if (tabList.length > 0) {
        result.push({ tabs: tabList })
      }
    }
    return result
  }

  // session files can be locked while the source browser runs: parse a temp
  // copy, and if neither copy nor read works, fall back to the newest older
  // Session file. An older file is only used when the newest is unreadable.
  function chromiumSessionWindows (profileDir) {
    var sessionsDir = path.join(profileDir, 'Sessions')
    var files
    try {
      files = fs.readdirSync(sessionsDir)
        .filter(function (f) { return f.indexOf('Session_') === 0 })
        .sort()
        .reverse()
        .slice(0, 3)
    } catch (e) {
      return null
    }
    for (var i = 0; i < files.length; i++) {
      var file = path.join(sessionsDir, files[i])
      var tmp = ''
      try {
        tmp = path.join(app.getPath('temp'), 'tabi-import-' + Date.now() + '-' + i + '.snss')
        try {
          fs.copyFileSync(file, tmp)
        } catch (copyErr) {
          tmp = '' // locked: try an in-place read before giving up
        }
        var data = fs.readFileSync(tmp || file)
        return replaySNSS(readSNSSCommands(data))
      } catch (e) {
        // unreadable (locked or unsupported version): try the next-older file
      } finally {
        if (tmp) {
          try { fs.unlinkSync(tmp) } catch (e) {}
        }
      }
    }
    return null
  }

  function chromiumBookmarks (profileDir) {
    var data
    try {
      data = JSON.parse(fs.readFileSync(path.join(profileDir, 'Bookmarks'), 'utf-8'))
    } catch (e) {
      return []
    }
    var out = []
    function walk (node, folder) {
      if (!node || !node.children) return
      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i]
        if (child.type === 'url' && child.url && isImportableURL(child.url)) {
          var title = (child.name || '').trim()
          if (folder) title = folder + ' / ' + title
          out.push({ title: title || child.url, url: child.url })
        } else if (child.type === 'folder' || child.children) {
          walk(child, folder ? folder + ' / ' + (child.name || '') : (child.name || ''))
        }
      }
    }
    var roots = data.roots || {}
    walk(roots.bookmark_bar, '')
    walk(roots.other, 'Other Bookmarks')
    walk(roots.synced, 'Mobile Bookmarks')
    return out
  }

  /* ---------- Firefox (mozLz4) ---------- */

  function mozLz4Decompress (data) {
    if (data.length < 12 || data.toString('ascii', 0, 8) !== 'mozLz40\0') {
      throw new Error('not a mozlz4 file')
    }
    var outSize = data.readUInt32LE(8)
    var out = Buffer.alloc(outSize)
    var inPos = 12
    var outPos = 0
    while (inPos < data.length && outPos < outSize) {
      var token = data[inPos++]
      var litLen = token >> 4
      if (litLen === 15) {
        var extra
        do {
          extra = data[inPos++]
          litLen += extra
        } while (extra === 255)
      }
      if (inPos + litLen > data.length) throw new Error('corrupt mozlz4')
      data.copy(out, outPos, inPos, inPos + litLen)
      inPos += litLen
      outPos += litLen
      if (inPos >= data.length) break
      if (inPos + 2 > data.length) throw new Error('corrupt mozlz4')
      var offset = data[inPos] | (data[inPos + 1] << 8)
      inPos += 2
      var matchLen = (token & 0xf) + 4
      if ((token & 0xf) === 15) {
        var extraLen
        do {
          extraLen = data[inPos++]
          matchLen += extraLen
        } while (extraLen === 255)
      }
      var matchPos = outPos - offset
      if (matchPos < 0 || matchPos >= outSize) throw new Error('corrupt mozlz4')
      for (var m = 0; m < matchLen && outPos < outSize; m++) {
        out[outPos++] = out[matchPos++]
      }
    }
    return out
  }

  function firefoxSessionWindows (profileDir) {
    var backupDir = path.join(profileDir, 'sessionstore-backups')
    var candidates = ['recovery.jsonlz4', 'previous.jsonlz4', 'recovery.baklz4']
    for (var i = 0; i < candidates.length; i++) {
      try {
        var json = JSON.parse(mozLz4Decompress(fs.readFileSync(path.join(backupDir, candidates[i]))).toString('utf8'))
        var result = []
        var windowsList = json.windows || []
        for (var w = 0; w < windowsList.length; w++) {
          var tabList = []
          var tabs = windowsList[w].tabs || []
          for (var t = 0; t < tabs.length; t++) {
            var tab = tabs[t]
            if (tab.hidden) continue
            var entries = tab.entries || []
            var current = tab.index > 0 && tab.index <= entries.length ? entries[tab.index - 1] : entries[entries.length - 1]
            if (current && current.url && isImportableURL(current.url)) {
              tabList.push({ url: current.url, title: current.title || current.url })
            }
          }
          if (tabList.length > 0) {
            result.push({ tabs: tabList })
          }
        }
        return result
      } catch (e) {
        // try the next backup file
      }
    }
    return null
  }

  function firefoxProfiles (browser) {
    // Firefox-family profile data (incl. sessionstore-backups) lives under
    // %APPDATA%, not %LOCALAPPDATA%
    var root = path.join(roamingAppData, ...browser.root)
    var profiles = []
    var seen = new Set()
    function add (full, name) {
      if (!seen.has(full.toLowerCase())) {
        seen.add(full.toLowerCase())
        profiles.push({ dir: full, name: name || path.basename(full) })
      }
    }
    // profiles.ini: [InstallXXX] sections carry Default=<profile path>, while
    // [ProfileN] sections carry Path= plus an optional Name=; Default=1 inside
    // a [ProfileN] section is a flag, not a path
    try {
      var ini = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf-8')
      var sections = []
      var current = null
      ini.split(/\r?\n/).forEach(function (line) {
        var section = line.match(/^\[(.+)\]$/)
        if (section) {
          current = {}
          sections.push({ header: section[1], keys: current })
          return
        }
        if (!current) return
        var kv = line.match(/^([^=]+)=(.*)$/)
        if (kv) current[kv[1].trim()] = kv[2].trim()
      })
      var namesByPath = {}
      sections.forEach(function (s) {
        if (s.keys.Path && s.keys.Name) {
          namesByPath[path.join(root, s.keys.Path).toLowerCase()] = s.keys.Name
        }
      })
      sections.forEach(function (s) {
        var rel = /^Install/.test(s.header) ? s.keys.Default : s.keys.Path
        if (!rel) return
        var full = path.isAbsolute(rel) ? rel : path.join(root, rel)
        add(full, namesByPath[full.toLowerCase()])
      })
    } catch (e) {
      // no profiles.ini: scan the Profiles directory below
    }
    if (profiles.length === 0) {
      try {
        fs.readdirSync(path.join(root, 'Profiles')).forEach(function (dir) {
          add(path.join(root, 'Profiles', dir), dir)
        })
      } catch (e) {}
    }
    return profiles
  }

  // returns [{ token, name }]: token goes into the source id and resolves back
  // to the profile directory via chromiumProfileDir
  function chromiumProfiles (browser) {
    var base = browser.roaming ? path.join(roamingAppData, ...browser.base) : path.join(localAppData, ...browser.base)
    var entries = []
    try {
      var localState = JSON.parse(fs.readFileSync(path.join(base, 'Local State'), 'utf-8'))
      var infoCache = (localState.profile || {}).info_cache || {}
      entries = Object.keys(infoCache).map(function (dir) {
        return { token: dir, name: infoCache[dir].name || dir }
      })
    } catch (e) {
      entries = []
    }
    if (entries.length === 0) {
      try {
        entries = fs.readdirSync(base)
          .filter(function (d) { return d === 'Default' || /^Profile \d+$/.test(d) })
          .map(function (d) { return { token: d, name: d } })
      } catch (e) {
        entries = []
      }
    }
    if (browser.flatProfile) {
      if (entries.length === 0) {
        return [{ token: '@flat', name: browser.flatProfile }]
      }
      return []
    }
    return entries
  }

  function chromiumProfileDir (browser, token) {
    var base = browser.roaming ? path.join(roamingAppData, ...browser.base) : path.join(localAppData, ...browser.base)
    if (token === '@flat') {
      return path.join(base, browser.flatProfile)
    }
    return path.join(base, token)
  }

  function detectSources () {
    var sources = []
    for (var i = 0; i < CHROMIUM_BROWSERS.length; i++) {
      var browser = CHROMIUM_BROWSERS[i]
      var profiles = chromiumProfiles(browser)
      for (var p = 0; p < profiles.length; p++) {
        var profile = profiles[p]
        var dir = chromiumProfileDir(browser, profile.token)
        var windowsData = chromiumSessionWindows(dir)
        if (windowsData == null) continue
        var count = windowsData.reduce(function (n, w) { return n + w.tabs.length }, 0)
        sources.push({
          id: CHROMIUM_PREFIX + browser.id + ':' + profile.token,
          browser: browser.name,
          name: profile.name,
          tabCount: count,
          hasBookmarks: fs.existsSync(path.join(dir, 'Bookmarks'))
        })
      }
    }
    for (var f = 0; f < FIREFOX_BROWSERS.length; f++) {
      var ffbrowser = FIREFOX_BROWSERS[f]
      var ffprofiles = firefoxProfiles(ffbrowser)
      for (var fp = 0; fp < ffprofiles.length; fp++) {
        var ffprofile = ffprofiles[fp]
        if (!fs.existsSync(path.join(ffprofile.dir, 'sessionstore-backups'))) continue
        var ffWindows = firefoxSessionWindows(ffprofile.dir)
        if (ffWindows == null) continue
        var ffCount = ffWindows.reduce(function (n, w) { return n + w.tabs.length }, 0)
        sources.push({
          id: FIREFOX_PREFIX + ffbrowser.id + ':' + ffprofile.dir,
          browser: ffbrowser.name,
          name: ffprofile.name,
          tabCount: ffCount,
          hasBookmarks: false
        })
      }
    }
    return sources
  }

  function readSource (sourceId, options) {
    var windowsData
    var bookmarks = []
    if (sourceId.startsWith(CHROMIUM_PREFIX)) {
      var rest = sourceId.slice(CHROMIUM_PREFIX.length)
      var colon = rest.indexOf(':')
      var browserId = rest.slice(0, colon)
      var dirToken = rest.slice(colon + 1)
      var browser = CHROMIUM_BROWSERS.find(function (b) { return b.id === browserId })
      if (!browser) throw new Error('unknown source')
      var profileDir = chromiumProfileDir(browser, dirToken)
      windowsData = chromiumSessionWindows(profileDir)
      if (windowsData == null) throw new Error('unreadable session')
      if (options && options.includeBookmarks) {
        bookmarks = chromiumBookmarks(profileDir)
      }
    } else if (sourceId.startsWith(FIREFOX_PREFIX)) {
      var ffRest = sourceId.slice(FIREFOX_PREFIX.length)
      var ffColon = ffRest.indexOf(':')
      var ffBrowser = FIREFOX_BROWSERS.find(function (b) { return b.id === ffRest.slice(0, ffColon) })
      if (!ffBrowser) throw new Error('unknown source')
      windowsData = firefoxSessionWindows(ffRest.slice(ffColon + 1))
      if (windowsData == null) throw new Error('unreadable session')
    } else {
      throw new Error('unknown source')
    }
    return { windows: windowsData, bookmarks: bookmarks }
  }

  /* ---------- IPC ---------- */

  var cachedBucketList = []

  function pageIsImport (senderFrameURL) {
    return typeof senderFrameURL === 'string' && senderFrameURL.startsWith('min://app/pages/import/')
  }

  ipc.handle('import:sources', function (e) {
    var senderURL
    try {
      senderURL = e.senderFrame.url
    } catch (err) {
      return []
    }
    if (!pageIsImport(senderURL)) {
      return []
    }
    return detectSources()
  })

  ipc.handle('import:read', function (e, sourceId, options) {
    var senderURL
    try {
      senderURL = e.senderFrame.url
    } catch (err) {
      throw new Error('bad sender')
    }
    if (!pageIsImport(senderURL)) {
      throw new Error('bad sender')
    }
    return readSource(String(sourceId), options || {})
  })

  ipc.handle('import:buckets', function () {
    return cachedBucketList
  })

  ipc.on('import:bucket-sync', function (e, list) {
    if (Array.isArray(list)) {
      cachedBucketList = list
    }
  })

  ipc.handle('import:page', function (e, payload) {
    var senderURL
    try {
      senderURL = e.senderFrame.url
    } catch (err) {
      return null
    }
    if (!pageIsImport(senderURL) || !payload || typeof payload.op !== 'string') {
      return null
    }
    if (payload.op === 'buckets') {
      return cachedBucketList
    }
    if (payload.op === 'containers') {
      return containerRegistry.containers
    }
    if (payload.op === 'import') {
      var windowWrapper = windows.windowFromContents(e.sender)
      var target = windowWrapper ? windowWrapper.win : windows.getCurrent()
      if (!target) {
        return null
      }
      var data = payload.args || {}
      sendIPCToWindow(target, 'import-tabs', data)
      var count = (data.windows || []).reduce(function (n, w) { return n + (w.tabs || []).length }, 0) + ((data.bookmarks || []).length)
      return { accepted: true, count: count }
    }
    return null
  })

  return {
    detectSources: detectSources,
    readSource: readSource
  }
})()
