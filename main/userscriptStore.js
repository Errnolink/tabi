/* Userscript store: installs and persists userscripts under
   userData/userscripts, auto-updates them from their @updateURL/@downloadURL,
   intercepts navigations to .user.js files to show the install prompt, and
   serves the GM API relay used by injected scripts. Injection itself stays in
   js/userscripts.js. */

const { fileURLToPath } = require('url')

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

var gmValuesCache = {}
var gmValuesFlushTimers = {}
const GM_VALUES_FLUSH_DELAY = 500

function gmReadValues (id) {
  if (gmValuesCache[id]) {
    return gmValuesCache[id]
  }
  var values = {}
  try {
    var data = JSON.parse(fs.readFileSync(path.join(userscriptStoreDir, id + '.values.json'), 'utf-8'))
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      values = data
    }
  } catch (e) { }
  gmValuesCache[id] = values
  return values
}

function gmWriteValuesFile (file, values) {
  var tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(values))
  fs.renameSync(tmp, file)
}

function gmFlushValuesSync (id) {
  var values = gmValuesCache[id]
  if (!values) {
    return
  }
  try {
    gmWriteValuesFile(path.join(userscriptStoreDir, id + '.values.json'), values)
  } catch (e) { }
}

function gmFlushValues (id) {
  if (gmValuesFlushTimers[id]) {
    clearTimeout(gmValuesFlushTimers[id])
    delete gmValuesFlushTimers[id]
  }
  var values = gmValuesCache[id]
  if (!values) {
    return Promise.resolve()
  }
  var file = path.join(userscriptStoreDir, id + '.values.json')
  var tmp = file + '.tmp'
  return fs.promises.writeFile(tmp, JSON.stringify(values)).then(function () {
    return fs.promises.rename(tmp, file)
  }).catch(function () { })
}

function gmScheduleValuesFlush (id) {
  if (gmValuesFlushTimers[id]) {
    return
  }
  gmValuesFlushTimers[id] = setTimeout(function () {
    delete gmValuesFlushTimers[id]
    gmFlushValues(id)
  }, GM_VALUES_FLUSH_DELAY)
}

function gmFlushAllValuesSync () {
  Object.keys(gmValuesCache).forEach(function (id) {
    if (gmValuesFlushTimers[id]) {
      clearTimeout(gmValuesFlushTimers[id])
      delete gmValuesFlushTimers[id]
    }
    gmFlushValuesSync(id)
  })
}

function userscriptStoreSlug (name) {
  var slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return slug || 'userscript'
}

function userscriptStoreIdentity (features, sourceUrl) {
  if (features.namespace && features.namespace[0]) {
    return String(features.namespace[0])
  }
  return sourceUrl || ('name:' + ((features.name && features.name[0]) || ''))
}

function userscriptStoreMetaIdentity (meta) {
  return meta.namespace || ('name:' + (meta.name || ''))
}

function userscriptStoreIdFor (features, sourceUrl) {
  var slug = userscriptStoreSlug((features.name && features.name[0]) || '')
  var identity = userscriptStoreIdentity(features, sourceUrl)
  var existing = userscriptStoreCache[slug]
  if (!existing || userscriptStoreMetaIdentity(existing) === identity) {
    return slug
  }
  return slug + '-' + userscriptMeta.identityHash(identity)
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
    nameLocal: (features['name:local'] && features['name:local'][0]) || '',
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
  var features = userscriptMeta.parseHeader(source)
  if (!features || !(features.name && features.name[0])) {
    throw new Error('not a userscript')
  }
  var id = userscriptStoreIdFor(features, sourceUrl)
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
  if (gmValuesFlushTimers[id]) {
    clearTimeout(gmValuesFlushTimers[id])
    delete gmValuesFlushTimers[id]
  }
  delete gmValuesCache[id]
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

function userscriptStoreFetchText (url) {
  return net.fetch(url).then(function (res) {
    if (!res.ok) {
      throw new Error('HTTP ' + res.status)
    }
    return res.text()
  })
}

function userscriptStoreListGrew (oldList, newList) {
  oldList = oldList || []
  newList = newList || []
  return newList.some(function (item) { return oldList.indexOf(item) === -1 })
}

function userscriptStorePermissionsGrew (oldMeta, features) {
  var oldGrants = userscriptMeta.grantList(oldMeta.grants)
  var newGrants = userscriptMeta.grantList(features.grant)
  for (var key in newGrants) {
    if (!oldGrants[key]) {
      return true
    }
  }
  if (userscriptStoreListGrew(oldMeta.matches, features.match)) {
    return true
  }
  if (userscriptStoreListGrew(oldMeta.includes, features.include)) {
    return true
  }
  if (userscriptStoreListGrew(oldMeta.connect, features.connect)) {
    return true
  }
  return false
}

function userscriptStoreCheckUpdates (id) {
  var meta = userscriptStoreCache[id]
  if (!meta) {
    return Promise.resolve({ id: id, error: 'unknown userscript' })
  }
  var versionURL = meta.updateURL || meta.downloadURL
  var bodyURL = meta.downloadURL
  if (!versionURL) {
    meta.lastChecked = Date.now()
    userscriptStoreSaveMeta(meta)
    return Promise.resolve({ id: id, error: 'no update URL' })
  }
  if (!/^https:\/\//i.test(versionURL) || (bodyURL && !/^https:\/\//i.test(bodyURL))) {
    return Promise.resolve({ id: id, error: 'insecure update URL' })
  }
  var checkTime = Date.now()
  return userscriptStoreFetchText(versionURL).then(function (versionSource) {
    var versionFeatures = userscriptMeta.parseHeader(versionSource)
    if (!versionFeatures || !(versionFeatures.version && versionFeatures.version[0])) {
      throw new Error('update has no version')
    }
    var newVersion = versionFeatures.version[0]
    if (userscriptStoreCompareVersions(newVersion, meta.version) <= 0) {
      meta.lastChecked = checkTime
      userscriptStoreSaveMeta(meta)
      return { id: id, updated: false, version: meta.version }
    }
    if (!bodyURL) {
      return { id: id, updated: false, updateAvailable: true, version: newVersion }
    }
    return userscriptStoreFetchText(bodyURL).then(function (bodySource) {
      var features = userscriptMeta.parseHeader(bodySource)
      if (!features || !(features.version && features.version[0])) {
        throw new Error('update has no version')
      }
      var newMeta = userscriptStoreMetaFromFeatures(id, features, meta.sourceUrl)
      if (userscriptStoreCompareVersions(newMeta.version, meta.version) <= 0) {
        meta.lastChecked = checkTime
        userscriptStoreSaveMeta(meta)
        return { id: id, updated: false, version: meta.version }
      }
      if (userscriptStorePermissionsGrew(meta, features)) {
        meta.lastChecked = checkTime
        userscriptStoreSaveMeta(meta)
        return { id: id, updated: false, needsReview: true, version: newMeta.version }
      }
      fs.writeFileSync(path.join(userscriptStoreDir, id + '.user.js'), bodySource)
      newMeta.enabled = meta.enabled !== false
      newMeta.installedAt = meta.installedAt
      newMeta.lastChecked = checkTime
      userscriptStoreSaveMeta(newMeta)
      userscriptStoreBroadcast()
      return { id: id, updated: true, version: newMeta.version }
    })
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
  return /^(https?|file):\/\//i.test(url) && /\.user\.js([?#]|$)/i.test(url)
}

function userscriptInstallPageURL (sourceURL) {
  return 'min://app/pages/userscripts/install.html?src=' + encodeURIComponent(sourceURL)
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

function gmPerformRequest (e, payload, frameURL, args) {
  var meta = userscriptStoreCache[payload.scriptId]
  var reqId = args[0]
  var details = args[1] || {}
  var target
  try {
    target = new URL(details.url)
  } catch (err) {
    return Promise.resolve({ ok: false, data: { error: 'invalid URL' } })
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return Promise.resolve({ ok: false, data: { error: 'unsupported protocol' } })
  }
  var sameHost = false
  try {
    sameHost = new URL(frameURL).hostname === target.hostname
  } catch (err) { }
  if (!sameHost && !userscriptMeta.connectAllowed(meta.connect, target.hostname)) {
    return Promise.resolve({ ok: false, data: { error: 'blocked by @connect' } })
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
  return e.sender.session.fetch(details.url, init).then(function (res) {
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
    return { ok: true, data: gmFormatResponse(details, result) }
  }).catch(function (err) {
    clearTimeout(timer)
    gmInflightRequests.delete(key)
    if (timedOut) {
      return { ok: true, data: { timedOut: true } }
    }
    return { ok: false, data: { error: String((err && err.message) || err) } }
  })
}

ipc.handle('userscript-gm-request', function (e, payload) {
  if (!payload || typeof payload.scriptId !== 'string' || typeof payload.call !== 'string') {
    return { ok: false, data: { error: 'invalid request' } }
  }
  var frameURL = ''
  try {
    if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame) {
      return { ok: false, data: { error: 'not allowed from this frame' } }
    }
    frameURL = e.senderFrame.url
  } catch (err) {
    return { ok: false, data: { error: 'not allowed from this frame' } }
  }
  var meta = userscriptStoreCache[payload.scriptId]
  if (!meta || meta.enabled === false) {
    return { ok: false, data: { error: 'unknown userscript' } }
  }
  if (!frameURL || !userscriptMeta.matchesUrl(meta, frameURL)) {
    return { ok: false, data: { error: 'userscript is not active on this page' } }
  }
  var granted = userscriptMeta.grantList(meta.grants)
  var args = Array.isArray(payload.args) ? payload.args : []
  switch (payload.call) {
    case 'setValue':
      if (!granted.setValue) {
        return { ok: false, data: { error: 'not granted' } }
      }
      var values = gmReadValues(meta.id)
      if (args.length < 2 || args[1] === undefined) {
        delete values[args[0]]
      } else {
        values[args[0]] = args[1]
      }
      gmScheduleValuesFlush(meta.id)
      return { ok: true, data: null }
    case 'deleteValue':
      if (!granted.deleteValue) {
        return { ok: false, data: { error: 'not granted' } }
      }
      var stored = gmReadValues(meta.id)
      delete stored[args[0]]
      gmScheduleValuesFlush(meta.id)
      return { ok: true, data: null }
    case 'openInTab':
      if (!granted.openInTab) {
        return { ok: false, data: { error: 'not granted' } }
      }
      var targetURL = String(args[0] || '')
      if (!/^https?:\/\//i.test(targetURL)) {
        return { ok: false, data: { error: 'unsupported URL' } }
      }
      sendIPCToWindow(windows.getCurrent(), 'addTab', { url: targetURL })
      return { ok: true, data: null }
    case 'setClipboard':
      if (!granted.setClipboard) {
        return { ok: false, data: { error: 'not granted' } }
      }
      electron.clipboard.writeText(String(args[0] === undefined ? '' : args[0]))
      return { ok: true, data: null }
    case 'xmlhttpRequest':
      if (!granted.xmlhttpRequest) {
        return { ok: false, data: { error: 'not granted' } }
      }
      return gmPerformRequest(e, payload, frameURL, args)
    case 'abortRequest':
      var controller = gmInflightRequests.get(e.sender.id + ':' + payload.scriptId + ':' + args[0])
      if (controller) {
        controller.abort()
      }
      return { ok: true, data: null }
    default:
      return { ok: false, data: { error: 'unknown call' } }
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

function userscriptStoreReadSource (url) {
  if (!/^file:\/\//i.test(url)) {
    return net.fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status)
      }
      return res.text()
    })
  }
  return new Promise(function (resolve, reject) {
    var filePath = ''
    try {
      filePath = fileURLToPath(url)
    } catch (err) {
      reject(new Error('invalid file URL'))
      return
    }
    fs.readFile(filePath, 'utf-8', function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

function userscriptStoreInspect (url) {
  if (!isUserScriptURL(url)) {
    return Promise.resolve({ ok: false, error: 'not a userscript URL' })
  }
  return userscriptStoreReadSource(url).then(function (source) {
    var features = userscriptMeta.parseHeader(source)
    if (!features) {
      return { ok: false, error: 'header' }
    }
    var display = userscriptStoreMetaFromFeatures('', features, url)
    var installId = userscriptStoreIdFor(features, url)
    var existing = userscriptStoreCache[installId]
    return {
      ok: true,
      source: source,
      display: display,
      replaces: existing ? { id: existing.id, name: existing.name, version: existing.version } : null
    }
  }).catch(function (err) {
    return { ok: false, error: String((err && err.message) || err) }
  })
}

function userscriptStorePageSenderURL (e) {
  try {
    if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame) {
      return ''
    }
    return e.senderFrame.url || ''
  } catch (err) {
    return ''
  }
}

ipc.handle('userscriptStore:page', function (e, payload) {
  var senderURL = userscriptStorePageSenderURL(e)
  if (!senderURL.startsWith('min://app/pages/userscripts/')) {
    return null
  }
  if (payload && payload.op === 'install' && !/^min:\/\/app\/pages\/userscripts\/install\.html(\?|$)/.test(senderURL)) {
    throw new Error('installs are only allowed from the install prompt')
  }
  var args = (payload && payload.args) || {}
  switch (payload && payload.op) {
    case 'list':
      return userscriptStoreSummaries()
    case 'suggested':
      return userscriptStoreSuggestedState()
    case 'inspect':
      return userscriptStoreInspect(String(args.url))
    case 'install':
      return userscriptStoreInstallFromSource(String(args.source), String(args.sourceUrl || ''))
    case 'installBundled':
      return userscriptStoreInstallBundled(String(args.id))
    case 'setEnabled':
      return userscriptStoreSetEnabled(String(args.id), args.enabled !== false)
    case 'remove':
      return userscriptStoreRemove(String(args.id))
    case 'checkUpdates':
      return userscriptStoreCheckUpdatesMany(args.id)
    default:
      throw new Error('unknown userscript store op')
  }
})

var userscriptStorePromptLoads = new WeakMap()

function userscriptStoreOpenPrompt (contents, sourceURL) {
  if (userscriptStorePromptLoads.get(contents) === sourceURL) {
    return
  }
  userscriptStorePromptLoads.set(contents, sourceURL)
  setImmediate(function () {
    if (contents.isDestroyed()) {
      return
    }
    contents.loadURL(userscriptInstallPageURL(sourceURL)).catch(function () { }).finally(function () {
      if (userscriptStorePromptLoads.get(contents) === sourceURL) {
        userscriptStorePromptLoads.delete(contents)
      }
    })
  })
}

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
    if (intercept(url, true) !== 'cancel') {
      return
    }
    e.preventDefault()
    userscriptStoreOpenPrompt(contents, url)
  })
  contents.on('did-start-navigation', function (e, url, isInPlace, isMainFrame) {
    if (!isMainFrame) {
      return
    }
    if (intercept(url, false) !== 'redirect') {
      return
    }
    userscriptStoreOpenPrompt(contents, url)
  })

  /* the typed-URL path commits the .user.js entry before the redirect; drop it
     from history so going back from the install prompt skips the raw source */
  contents.on('did-navigate', function (e, url) {
    if (intercept(url, false) === 'redirect') {
      userscriptStoreOpenPrompt(contents, url)
    }
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

app.on('before-quit', function () {
  gmFlushAllValuesSync()
})
