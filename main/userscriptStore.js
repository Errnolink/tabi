/* Userscript store: installs and persists userscripts under
   userData/userscripts, auto-updates them from their @updateURL/@downloadURL,
   intercepts navigations to .user.js files to show the install prompt, and
   serves the GM API relay used by injected scripts. Injection itself stays in
   js/userscripts.js. */

var userscriptStoreDir = path.join(userDataPath, 'userscripts')

var userscriptStoreSuggested = [
  { id: 'control-panel-for-twitter', bundledFile: 'control-panel-for-twitter.user.js' }
]

var userscriptStoreCache = {}
var gmInflightRequests = new Map()

const USERSCRIPT_STORE_UPDATE_INTERVAL = 24 * 60 * 60 * 1000

function userscriptStoreWriteJSON (file, data) {
  var tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data))
  fs.renameSync(tmp, file)
}

function userscriptStoreReadMeta (id) {
  try {
    var data = JSON.parse(fs.readFileSync(path.join(userscriptStoreDir, id + '.json'), 'utf-8'))
    if (data && typeof data === 'object' && data.id === id) {
      return data
    }
  } catch (e) { }
  return null
}

function gmReadValues (id) {
  try {
    var data = JSON.parse(fs.readFileSync(path.join(userscriptStoreDir, id + '.values.json'), 'utf-8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data
    }
  } catch (e) { }
  return {}
}

function gmWriteValues (id, values) {
  userscriptStoreWriteJSON(path.join(userscriptStoreDir, id + '.values.json'), values)
}

function userscriptStoreSlug (name) {
  var slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return slug || 'userscript'
}

function parseUserScriptHeader (content) {
  var features = {}
  var found = false
  var inBlock = false
  var lines = String(content).split('\n')
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim()
    if (trimmed === '// ==UserScript==') {
      inBlock = true
      continue
    }
    if (trimmed === '// ==/UserScript==') {
      break
    }
    if (inBlock && lines[i].startsWith('//')) {
      found = true
      var feature = lines[i].replace('//', '').trim()
      var name = feature.split(/\s+/)[0]
      var value = feature.slice(name.length).trim()
      name = name.replace('@', '')
      if (!features[name]) {
        features[name] = []
      }
      features[name].push(value)
    }
  }
  return found ? features : null
}

function userscriptStoreVersionPart (version, index) {
  var part = String(version).split('.')[index]
  if (part === undefined) {
    return null
  }
  var match = part.match(/^(\d+)(.*)$/)
  if (match) {
    return { num: Number(match[1]), suffix: match[2] }
  }
  return { num: null, suffix: part }
}

function userscriptStoreCompareVersions (a, b) {
  for (var i = 0; i < 16; i++) {
    var va = userscriptStoreVersionPart(a, i)
    var vb = userscriptStoreVersionPart(b, i)
    if (va === null && vb === null) {
      return 0
    }
    if (va === null) {
      return -1
    }
    if (vb === null) {
      return 1
    }
    if (va.num !== null && vb.num !== null) {
      if (va.num !== vb.num) {
        return va.num < vb.num ? -1 : 1
      }
      if (va.suffix !== vb.suffix) {
        if (!va.suffix) {
          return 1
        }
        if (!vb.suffix) {
          return -1
        }
        if (va.suffix !== vb.suffix) {
          return va.suffix < vb.suffix ? -1 : 1
        }
      }
    } else {
      var sa = va.num !== null ? String(va.num) + va.suffix : va.suffix
      var sb = vb.num !== null ? String(vb.num) + vb.suffix : vb.suffix
      if (sa !== sb) {
        return sa < sb ? -1 : 1
      }
    }
  }
  return 0
}

function userscriptStoreMetaFromFeatures (id, features, sourceUrl) {
  return {
    id: id,
    name: (features.name && features.name[0]) || id,
    version: (features.version && features.version[0]) || '0',
    description: (features.description && features.description[0]) || '',
    author: (features.author && features.author[0]) || '',
    namespace: (features.namespace && features.namespace[0]) || '',
    matches: features.match || [],
    includes: features.include || [],
    excludes: features.exclude || [],
    grants: features.grant || [],
    connect: features.connect || [],
    runAt: (features['run-at'] && features['run-at'][0]) || '',
    updateURL: (features.updateURL && features.updateURL[0]) || '',
    downloadURL: (features.downloadURL && features.downloadURL[0]) || '',
    sourceUrl: sourceUrl || '',
    enabled: true,
    installedAt: Date.now(),
    lastChecked: 0
  }
}

function userscriptStoreLoadCache () {
  userscriptStoreCache = {}
  try {
    fs.readdirSync(userscriptStoreDir).forEach(function (filename) {
      if (filename.endsWith('.json') && !filename.endsWith('.values.json')) {
        var meta = userscriptStoreReadMeta(filename.slice(0, -5))
        if (meta) {
          userscriptStoreCache[meta.id] = meta
        }
      }
    })
  } catch (e) { }
}

function userscriptStoreSaveMeta (meta) {
  userscriptStoreWriteJSON(path.join(userscriptStoreDir, meta.id + '.json'), meta)
  userscriptStoreCache[meta.id] = meta
}

function userscriptStoreBroadcast () {
  windows.openWindows.forEach(function (w) {
    if (w.closed) {
      return
    }
    try {
      getWindowWebContents(w.win).send('userscript-store-changed')
    } catch (e) { }
  })
  webContents.getAllWebContents().forEach(function (contents) {
    try {
      var url = contents.getURL()
      if (url && url.startsWith('min://app/pages/userscripts')) {
        contents.send('userscript-store-page-changed')
      }
    } catch (e) { }
  })
}

function userscriptStoreInstallFromSource (source, sourceUrl) {
  var features = parseUserScriptHeader(source)
  if (!features || !(features.name && features.name[0])) {
    throw new Error('not a userscript')
  }
  var id = userscriptStoreSlug(features.name[0])
  fs.mkdirSync(userscriptStoreDir, { recursive: true })
  fs.writeFileSync(path.join(userscriptStoreDir, id + '.user.js'), source)
  var previous = userscriptStoreCache[id]
  var meta = userscriptStoreMetaFromFeatures(id, features, sourceUrl)
  if (previous) {
    meta.enabled = previous.enabled !== false
    meta.installedAt = previous.installedAt
  }
  userscriptStoreSaveMeta(meta)
  userscriptStoreBroadcast()
  return meta
}

function userscriptStoreInstallBundled (bundledId) {
  var entry = userscriptStoreSuggested.find(function (s) { return s.id === bundledId })
  if (!entry) {
    throw new Error('unknown suggested userscript')
  }
  var source = fs.readFileSync(path.join(app.getAppPath(), 'ext', 'userscripts', entry.bundledFile), 'utf-8')
  return userscriptStoreInstallFromSource(source, '')
}

function userscriptStoreRemove (id) {
  if (!userscriptStoreCache[id]) {
    throw new Error('unknown userscript')
  }
  delete userscriptStoreCache[id]
  ;[id + '.user.js', id + '.json', id + '.values.json'].forEach(function (filename) {
    try {
      fs.unlinkSync(path.join(userscriptStoreDir, filename))
    } catch (e) { }
  })
  userscriptStoreBroadcast()
  return true
}

function userscriptStoreSetEnabled (id, enabled) {
  var meta = userscriptStoreCache[id]
  if (!meta) {
    throw new Error('unknown userscript')
  }
  meta.enabled = enabled !== false
  userscriptStoreSaveMeta(meta)
  userscriptStoreBroadcast()
  return meta
}

function userscriptStoreSummaries () {
  return Object.keys(userscriptStoreCache).map(function (id) {
    var meta = userscriptStoreCache[id]
    return {
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      author: meta.author,
      matches: (meta.matches || []).slice(0, 4),
      matchCount: (meta.matches || []).length + (meta.includes || []).length,
      enabled: meta.enabled !== false,
      sourceUrl: meta.sourceUrl || '',
      canUpdate: !!(meta.updateURL || meta.downloadURL),
      lastChecked: meta.lastChecked || 0,
      installedAt: meta.installedAt || 0
    }
  }).sort(function (a, b) { return a.name.localeCompare(b.name) })
}

function userscriptStoreSuggestedState () {
  return userscriptStoreSuggested.map(function (entry) {
    return {
      id: entry.id,
      installed: !!userscriptStoreCache[entry.id]
    }
  }).filter(function (entry) {
    try {
      fs.accessSync(path.join(app.getAppPath(), 'ext', 'userscripts', userscriptStoreSuggested.find(function (s) { return s.id === entry.id }).bundledFile))
    } catch (e) {
      return false
    }
    return true
  })
}

function userscriptStoreCheckUpdates (id) {
  var meta = userscriptStoreCache[id]
  if (!meta) {
    return Promise.resolve({ id: id, error: 'unknown userscript' })
  }
  var url = meta.downloadURL || meta.updateURL
  if (!url) {
    meta.lastChecked = Date.now()
    userscriptStoreSaveMeta(meta)
    return Promise.resolve({ id: id, error: 'no update URL' })
  }
  return net.fetch(url).then(function (res) {
    if (!res.ok) {
      throw new Error('HTTP ' + res.status)
    }
    return res.text()
  }).then(function (source) {
    var features = parseUserScriptHeader(source)
    if (!features || !(features.version && features.version[0])) {
      throw new Error('update has no version')
    }
    var newMeta = userscriptStoreMetaFromFeatures(id, features, meta.sourceUrl)
    if (userscriptStoreCompareVersions(newMeta.version, meta.version) > 0) {
      fs.writeFileSync(path.join(userscriptStoreDir, id + '.user.js'), source)
      newMeta.enabled = meta.enabled !== false
      newMeta.installedAt = meta.installedAt
      newMeta.lastChecked = Date.now()
      userscriptStoreSaveMeta(newMeta)
      userscriptStoreBroadcast()
      return { id: id, updated: true, version: newMeta.version }
    }
    meta.lastChecked = Date.now()
    userscriptStoreSaveMeta(meta)
    return { id: id, updated: false, version: meta.version }
  }).catch(function (err) {
    if (userscriptStoreCache[id]) {
      userscriptStoreCache[id].lastChecked = Date.now()
      userscriptStoreSaveMeta(userscriptStoreCache[id])
    }
    return { id: id, error: String((err && err.message) || err) }
  })
}

function userscriptStoreCheckUpdatesMany (id) {
  if (id) {
    return userscriptStoreCheckUpdates(id).then(function (result) { return [result] })
  }
  return Promise.all(Object.keys(userscriptStoreCache).map(function (key) {
    return userscriptStoreCheckUpdates(key)
  }))
}

function userscriptStoreAutoUpdateSweep () {
  Object.keys(userscriptStoreCache).forEach(function (id) {
    var meta = userscriptStoreCache[id]
    if (Date.now() - (meta.lastChecked || 0) < USERSCRIPT_STORE_UPDATE_INTERVAL) {
      return
    }
    userscriptStoreCheckUpdates(id)
  })
}

function isUserScriptURL (url) {
  return /^https?:\/\//i.test(url) && /\.user\.js([?#]|$)/i.test(url)
}

function userscriptInstallPageURL (sourceURL) {
  return 'min://app/pages/userscripts/install.html?src=' + encodeURIComponent(sourceURL)
}

function gmUrlMatchesPattern (url, pattern) {
  if (pattern === '*') {
    return true
  }
  var idx = -1
  var parts = pattern.split('*')
  for (var i = 0; i < parts.length; i++) {
    idx = url.indexOf(parts[i], idx)
    if (idx === -1) {
      return false
    }
    idx += parts[i].length
  }
  return true
}

function gmSenderMatches (meta, url) {
  var patterns = (meta.matches || []).concat(meta.includes || [])
  if (!patterns.length) {
    return false
  }
  if (!patterns.some(function (pattern) { return gmUrlMatchesPattern(url, pattern) })) {
    return false
  }
  return !(meta.excludes || []).some(function (pattern) { return gmUrlMatchesPattern(url, pattern) })
}

var GM_GRANT_ALIASES = {
  GM_getValue: 'getValue',
  'GM.getValue': 'getValue',
  GM_setValue: 'setValue',
  'GM.setValue': 'setValue',
  GM_deleteValue: 'deleteValue',
  'GM.deleteValue': 'deleteValue',
  GM_listValues: 'listValues',
  'GM.listValues': 'listValues',
  GM_addStyle: 'addStyle',
  'GM.addStyle': 'addStyle',
  GM_xmlhttpRequest: 'xmlhttpRequest',
  'GM.xmlHttpRequest': 'xmlhttpRequest',
  GM_openInTab: 'openInTab',
  'GM.openInTab': 'openInTab',
  GM_setClipboard: 'setClipboard',
  'GM.setClipboard': 'setClipboard',
  GM_registerMenuCommand: 'registerMenuCommand',
  'GM.registerMenuCommand': 'registerMenuCommand',
  GM_info: 'info',
  'GM.info': 'info',
  unsafeWindow: 'unsafeWindow'
}

function gmGrantList (meta) {
  var granted = {}
  ;(meta.grants || []).forEach(function (grant) {
    var key = GM_GRANT_ALIASES[String(grant).trim()]
    if (key) {
      granted[key] = true
    }
  })
  return granted
}

function gmGrantAllowed (meta, grant) {
  var granted = gmGrantList(meta)
  return granted[grant] === true
}

function gmHasAnyGrant (meta) {
  var granted = gmGrantList(meta)
  return Object.keys(granted).length > 0
}

function gmConnectAllowed (meta, host) {
  var rules = meta.connect || []
  if (!rules.length) {
    return true
  }
  return rules.some(function (rule) {
    if (rule === '*') {
      return true
    }
    if (rule.startsWith('*.')) {
      return host === rule.slice(2) || host.endsWith('.' + rule.slice(2))
    }
    return host === rule || host.endsWith('.' + rule)
  })
}

function gmReply (e, payload, ok, data) {
  e.sender.send('userscript-gm-result', {
    scriptId: payload.scriptId,
    cbId: payload.cbId,
    ok: ok,
    data: data
  })
}

function gmHeadersToObject (headers) {
  var result = {}
  var entries = headers.entries()
  var item = entries.next()
  while (!item.done) {
    if (result[item.value[0]] === undefined) {
      result[item.value[0]] = item.value[1]
    }
    item = entries.next()
  }
  return result
}

function gmFormatResponse (details, result) {
  var responseType = details.responseType || 'text'
  var response = {
    status: result.status,
    statusText: result.statusText,
    responseHeaders: result.headers,
    finalUrl: result.finalUrl
  }
  if (responseType === 'arraybuffer') {
    response.response = new Uint8Array(result.buffer)
  } else {
    response.responseText = Buffer.from(result.buffer).toString('utf-8')
    if (responseType === 'json') {
      try {
        response.response = JSON.parse(response.responseText)
      } catch (e) { }
    }
  }
  return response
}

function gmPerformRequest (e, payload, reply) {
  var meta = userscriptStoreCache[payload.scriptId]
  var reqId = payload.args[0]
  var details = payload.args[1] || {}
  var target
  try {
    target = new URL(details.url)
  } catch (err) {
    return reply(false, { error: 'invalid URL' })
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return reply(false, { error: 'unsupported protocol' })
  }
  if (!gmConnectAllowed(meta, target.hostname)) {
    return reply(false, { error: 'blocked by @connect' })
  }
  var key = e.sender.id + ':' + payload.scriptId + ':' + reqId
  var controller = new AbortController()
  gmInflightRequests.set(key, controller)
  var timedOut = false
  var timer = null
  if (details.timeout > 0) {
    timer = setTimeout(function () {
      timedOut = true
      controller.abort()
    }, details.timeout)
  }
  var method = String(details.method || 'GET').toUpperCase()
  var init = { method: method, signal: controller.signal }
  if (details.headers && typeof details.headers === 'object') {
    init.headers = details.headers
  }
  if (details.data != null && method !== 'GET' && method !== 'HEAD') {
    init.body = details.data
  }
  e.sender.session.fetch(details.url, init).then(function (res) {
    return res.arrayBuffer().then(function (buffer) {
      return {
        status: res.status,
        statusText: res.statusText,
        finalUrl: res.url,
        headers: gmHeadersToObject(res.headers),
        buffer: buffer
      }
    })
  }).then(function (result) {
    clearTimeout(timer)
    gmInflightRequests.delete(key)
    reply(true, gmFormatResponse(details, result))
  }).catch(function (err) {
    clearTimeout(timer)
    gmInflightRequests.delete(key)
    if (timedOut) {
      reply(true, { timedOut: true })
    } else {
      reply(false, { error: String((err && err.message) || err) })
    }
  })
}

ipc.on('userscript-gm-request', function (e, payload) {
  if (!payload || typeof payload.scriptId !== 'string' || typeof payload.call !== 'string') {
    return
  }
  var meta = userscriptStoreCache[payload.scriptId]
  var senderURL = ''
  try {
    senderURL = e.sender.getURL()
  } catch (err) { }
  if (!meta || meta.enabled === false || !gmSenderMatches(meta, senderURL)) {
    if (payload.call === 'xmlhttpRequest') {
      gmReply(e, payload, false, { error: 'userscript is not active on this page' })
    }
    return
  }
  var args = Array.isArray(payload.args) ? payload.args : []
  switch (payload.call) {
    case 'setValue':
      if (!gmHasAnyGrant(meta)) {
        return
      }
      var values = gmReadValues(meta.id)
      if (args.length < 2 || args[1] === undefined) {
        delete values[args[0]]
      } else {
        values[args[0]] = args[1]
      }
      try {
        gmWriteValues(meta.id, values)
      } catch (err) { }
      break
    case 'openInTab':
      if (!gmGrantAllowed(meta, 'openInTab')) {
        return gmReply(e, payload, false, { error: 'not granted' })
      }
      var targetURL = String(args[0] || '')
      if (!/^https?:\/\//i.test(targetURL)) {
        return gmReply(e, payload, false, { error: 'unsupported URL' })
      }
      sendIPCToWindow(windows.getCurrent(), 'addTab', { url: targetURL })
      gmReply(e, payload, true, null)
      break
    case 'setClipboard':
      if (!gmGrantAllowed(meta, 'setClipboard')) {
        return gmReply(e, payload, false, { error: 'not granted' })
      }
      electron.clipboard.writeText(String(args[0] === undefined ? '' : args[0]))
      gmReply(e, payload, true, null)
      break
    case 'xmlhttpRequest':
      if (!gmGrantAllowed(meta, 'xmlhttpRequest')) {
        return gmReply(e, payload, false, { error: 'not granted' })
      }
      gmPerformRequest(e, payload, function (ok, data) {
        gmReply(e, payload, ok, data)
      })
      break
    case 'abortRequest':
      var controller = gmInflightRequests.get(e.sender.id + ':' + payload.scriptId + ':' + args[0])
      if (controller) {
        controller.abort()
      }
      break
  }
})

ipc.handle('userscriptStore:list', function (e, includeContent) {
  return Object.keys(userscriptStoreCache).map(function (id) {
    var meta = userscriptStoreCache[id]
    var item = { id: id, meta: meta }
    if (includeContent) {
      try {
        item.content = fs.readFileSync(path.join(userscriptStoreDir, id + '.user.js'), 'utf-8')
      } catch (err) {
        item.content = ''
      }
    }
    return item
  })
})

ipc.handle('userscriptStore:getValues', function (e, id) {
  return gmReadValues(String(id))
})

function userscriptStoreInspect (url) {
  if (!isUserScriptURL(url)) {
    return Promise.resolve({ ok: false, error: 'not a userscript URL' })
  }
  return net.fetch(url).then(function (res) {
    if (!res.ok) {
      throw new Error('HTTP ' + res.status)
    }
    return res.text()
  }).then(function (source) {
    var features = parseUserScriptHeader(source)
    if (!features) {
      return { ok: false, error: 'header' }
    }
    return { ok: true, source: source, display: userscriptStoreMetaFromFeatures('', features, url) }
  }).catch(function (err) {
    return { ok: false, error: String((err && err.message) || err) }
  })
}

ipc.handle('userscriptStore:page', function (e, payload) {
  switch (payload && payload.op) {
    case 'list':
      return userscriptStoreSummaries()
    case 'suggested':
      return userscriptStoreSuggestedState()
    case 'inspect':
      return userscriptStoreInspect(String(payload.args.url))
    case 'install':
      return userscriptStoreInstallFromSource(String(payload.args.source), String(payload.args.sourceUrl || ''))
    case 'installBundled':
      return userscriptStoreInstallBundled(String(payload.args.id))
    case 'setEnabled':
      return userscriptStoreSetEnabled(String(payload.args.id), payload.args.enabled !== false)
    case 'remove':
      return userscriptStoreRemove(String(payload.args.id))
    case 'checkUpdates':
      return userscriptStoreCheckUpdatesMany(payload.args && payload.args.id)
    default:
      throw new Error('unknown userscript store op')
  }
})

app.on('web-contents-created', function (e, contents) {
  function intercept (url, cancel) {
    if (!isUserScriptURL(url)) {
      return false
    }
    if (contents.session === session.defaultSession) {
      return false
    }
    var currentURL = ''
    try {
      currentURL = contents.getURL()
    } catch (err) { }
    if (currentURL.startsWith('min://')) {
      return false
    }
    if (cancel) {
      return 'cancel'
    }
    return 'redirect'
  }
  contents.on('will-navigate', function (e, url) {
    var action = intercept(url, true)
    if (!action) {
      return
    }
    e.preventDefault()
    contents.loadURL(userscriptInstallPageURL(url)).catch(function () { })
  })
  contents.on('did-start-navigation', function (e, url, isInPlace, isMainFrame) {
    if (!isMainFrame) {
      return
    }
    if (!intercept(url, false)) {
      return
    }
    contents.loadURL(userscriptInstallPageURL(url)).catch(function () { })
  })

  /* the typed-URL path commits the .user.js entry before the redirect; drop it
     from history so going back from the install prompt skips the raw source */
  contents.on('did-navigate', function (e, url) {
    var match = /^min:\/\/app\/pages\/userscripts\/install\.html\?src=(.+)$/.exec(url)
    if (!match || contents.session === session.defaultSession) {
      return
    }
    var sourceURL
    try {
      sourceURL = decodeURIComponent(match[1])
    } catch (err) {
      return
    }
    var history = contents.navigationHistory
    for (var i = 0; i < history.length(); i++) {
      if (i === history.getActiveIndex()) {
        continue
      }
      try {
        if (history.getEntryAtIndex(i).url === sourceURL) {
          history.removeEntryAtIndex(i)
          break
        }
      } catch (err) { }
    }
  })
})

app.once('ready', function () {
  try {
    fs.mkdirSync(userscriptStoreDir, { recursive: true })
  } catch (e) { }
  if (settings.get('userscriptsEnabled') === undefined) {
    settings.set('userscriptsEnabled', true)
  }
  userscriptStoreLoadCache()
  setTimeout(userscriptStoreAutoUpdateSweep, 60000)
  setInterval(userscriptStoreAutoUpdateSweep, 6 * 60 * 60 * 1000)
})
