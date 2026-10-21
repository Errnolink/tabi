/* Installs, removes and updates store userscripts, and the IPC surface the
   userscripts page talks to. */

const { fileURLToPath } = require('url')

function userscriptStoreInstallFromSource (source, sourceUrl) {
  var features = userscriptMeta.parseHeader(source)
  if (!features || !(features.name && features.name[0])) {
    throw new Error('not a userscript')
  }
  var id = userscriptStoreIdFor(features, sourceUrl)
  return userscriptStoreFetchAssets(features).then(function (assets) {
    fs.mkdirSync(userscriptStoreDir, { recursive: true })
    userscriptStoreWriteAssetFiles(id, assets)
    fs.writeFileSync(path.join(userscriptStoreDir, id + '.user.js'), source)
    var previous = userscriptStoreCache[id]
    var meta = userscriptStoreMetaFromFeatures(id, features, sourceUrl)
    meta.requires = assets.requires.map(function (entry) { return entry.url })
    meta.resources = assets.resources.map(function (entry) { return { name: entry.name, url: entry.url, mime: entry.mime } })
    if (previous) {
      meta.enabled = previous.enabled !== false
      meta.installedAt = previous.installedAt
    }
    userscriptStoreSaveMeta(meta)
    userscriptStoreBroadcast()
    return meta
  })
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
  delete userscriptStorePayloadCache[id]
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
  userscriptStoreRemoveAssetFiles(id)
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
      return userscriptStoreFetchAssets(features).then(function (assets) {
        userscriptStoreWriteAssetFiles(id, assets)
        fs.writeFileSync(path.join(userscriptStoreDir, id + '.user.js'), bodySource)
        newMeta.enabled = meta.enabled !== false
        newMeta.installedAt = meta.installedAt
        newMeta.lastChecked = checkTime
        newMeta.requires = assets.requires.map(function (entry) { return entry.url })
        newMeta.resources = assets.resources.map(function (entry) { return { name: entry.name, url: entry.url, mime: entry.mime } })
        userscriptStoreSaveMeta(newMeta)
        userscriptStoreBroadcast()
        return { id: id, updated: true, version: newMeta.version }
      })
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

ipc.handle('userscriptStore:getAssets', function (e, id) {
  var meta = userscriptStoreCache[String(id)]
  if (!meta) {
    return { requires: [], resources: {} }
  }
  return userscriptStoreReadAssets(meta)
})

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
