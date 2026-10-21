/* document-start injection: loose-directory scripts are registered by the UI
   renderer, installed store scripts are served from the payload cache; page
   preloads ask synchronously for the scripts matching their frame URL. */

var userscriptStoreDirScripts = []
var userscriptStoreDirState = { registered: false, enabled: false }

/* Loose-directory userscripts are registered by the UI renderer, which reads and
   parses them; only app windows may register since this list injects into pages */
ipc.handle('userscript-register-dir-scripts', function (e, payload) {
  var fromUI = false
  try {
    if (e.senderFrame === e.sender.mainFrame) {
      fromUI = windows.getAll().some(function (win) {
        return getWindowWebContents(win) === e.sender
      })
    }
  } catch (err) {
    fromUI = false
  }
  if (!fromUI) {
    return false
  }
  var scripts = []
  if (payload && Array.isArray(payload.scripts)) {
    payload.scripts.forEach(function (script) {
      if (script && typeof script.content === 'string' && script.content && script.options && typeof script.options === 'object') {
        scripts.push({ options: script.options, content: script.content })
      }
    })
  }
  userscriptStoreDirScripts = scripts
  userscriptStoreDirState = { registered: true, enabled: !!(payload && payload.enabled === true) }
  return true
})

ipc.on('userscript-sync-userscripts', function (e, url) {
  var payload = []
  try {
    if (typeof url === 'string' && url.length < 4096) {
      payload = userscriptStoreSyncPayloads(url)
    }
  } catch (err) {
    payload = []
  }
  e.returnValue = payload
})

function userscriptStoreSyncPayloads (url) {
  if (!/^https?:\/\//i.test(url)) {
    return []
  }
  var enabled = userscriptStoreDirState.registered
    ? userscriptStoreDirState.enabled
    : settings.get('userscriptsEnabled') === true
  if (!enabled) {
    return []
  }
  var payloads = []
  Object.keys(userscriptStoreCache).sort().forEach(function (id) {
    var meta = userscriptStoreCache[id]
    if (meta.enabled === false) {
      return
    }
    if (userscriptMeta.normalizeRunAt(meta) !== 'document-start') {
      return
    }
    if (!userscriptMeta.matchesUrl(meta, url)) {
      return
    }
    var entry = userscriptStoreStartPayload(meta)
    if (entry) {
      payloads.push(entry)
    }
  })
  userscriptStoreDirScripts.forEach(function (script) {
    if (userscriptMeta.normalizeRunAt(script.options) !== 'document-start') {
      return
    }
    if (!userscriptMeta.matchesUrl(script.options, url)) {
      return
    }
    payloads.push({ world: 'main', code: script.content })
  })
  return payloads
}

function userscriptStoreStartPayload (meta) {
  var cached = userscriptStorePayloadCache[meta.id]
  if (cached) {
    return cached
  }
  var assets = userscriptStoreReadAssets(meta)
  var source
  try {
    source = fs.readFileSync(path.join(userscriptStoreDir, meta.id + '.user.js'), 'utf-8')
  } catch (err) {
    return null
  }
  var granted = userscriptMeta.grantList(meta.grants)
  var entry
  if (Object.keys(granted).length > 0) {
    var info = {
      id: meta.id,
      name: meta.name,
      version: meta.version,
      description: meta.description,
      namespace: meta.namespace,
      matches: meta.matches || [],
      includes: meta.includes || [],
      grants: meta.grants || [],
      'run-at': meta.runAt || '',
      content: source
    }
    entry = {
      world: 'isolated',
      code: userscriptMeta.assembleScriptCode(assets.requires, userscriptMeta.buildGMWrapped(info, gmReadValues(meta.id), assets.resources))
    }
  } else {
    entry = { world: 'main', code: userscriptMeta.assembleScriptCode(assets.requires, source) }
  }
  userscriptStorePayloadCache[meta.id] = entry
  return entry
}
