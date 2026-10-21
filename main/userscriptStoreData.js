/* Userscript store: persistent state under userData/userscripts — the metadata
   cache, identity/version helpers, and the read/write/broadcast primitives shared
   by the install, relay, injection and interception modules. Injection itself
   stays in js/userscripts.js. */

var userscriptStoreDir = path.join(userDataPath, 'userscripts')

var userscriptStoreSuggested = [
  { id: 'control-panel-for-twitter', bundledFile: 'control-panel-for-twitter.user.js' }
]

var userscriptStoreCache = {}

/* built payloads are memoised per script and invalidated on meta/value changes */
var userscriptStorePayloadCache = {}

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
    requires: (features.require || []).slice(),
    resources: (features.resource || []).slice(),
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
  delete userscriptStorePayloadCache[meta.id]
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
