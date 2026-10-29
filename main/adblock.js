/*
Built-in content blocking powered by @ghostery/adblocker-electron. A single
engine built from Ghostery's prebuilt ads + tracking lists serves both blocking
levels: level 1 matches third-party network requests only, level 2 adds
cosmetic filters and scriptlets through the library's frame preload. The
malicious-site and phishing lists run as two separate small engines that are
only consulted for main-frame navigations; a hit cancels the navigation and
sends the tab to the internal phishing warning page. All engines are cached in
userData and refreshed in the background at most once a day; loading never
blocks window creation. Sessions where an extension with blocking webRequest
(e.g. uBlock Origin) is loaded get neither the network listener (see
main/filtering.js) nor the cosmetic-filter preload.
*/

/* global fs, path, ipc, app, webContents, windows, userDataPath, enabledFilteringOptions, registeredFilteringSessions, requestDomainIsException */

const { ElectronBlocker, FiltersEngine, Request } = require('@ghostery/adblocker-electron')

const adblockEnginePath = path.join(userDataPath, 'adblock-engine.bin')
const adblockRefreshInterval = 24 * 60 * 60 * 1000

var adblockEngine = null
var adblockEngineLoadStarted = false
var adblockEnginesWaitReady = false
var adblockEngineRefreshTimer = null
var adblockEngineRefreshing = false
var adblockBootStarted = false
var adblockBootScheduled = false

function adblockStartEngines () {
  if (adblockBootStarted) {
    return
  }
  adblockBootStarted = true
  if (enabledFilteringOptions.blockingLevel > 0) {
    adblockEnsureEngines()
  }
}

function adblockWatchFirstWindow (win) {
  var started = false
  var start = function () {
    if (!started) {
      started = true
      setTimeout(adblockStartEngines, 400)
    }
  }
  try {
    win.once('ready-to-show', start)
    var contents = win.webContents
    if (contents.isLoading()) {
      contents.once('did-finish-load', start)
    } else {
      start()
    }
  } catch (err) {
    start()
  }
  setTimeout(start, 8000)
}

function adblockScheduleBootStart () {
  if (adblockBootScheduled) {
    return
  }
  adblockBootScheduled = true
  var begin = function () {
    var existing = windows.getAll()
    if (existing.length > 0) {
      adblockWatchFirstWindow(existing[0])
      return
    }
    app.once('browser-window-created', function (e, win) {
      adblockWatchFirstWindow(win)
    })
    setTimeout(function () {
      if (!adblockBootStarted) {
        adblockStartEngines()
      }
    }, 12000)
  }
  if (app.isReady()) {
    begin()
  } else {
    app.whenReady().then(begin)
  }
}

const adblockMalwareLists = [
  {
    id: 'urlhaus',
    url: 'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
    cachePath: path.join(userDataPath, 'adblock-urlhaus-engine.bin'),
    engine: null,
    loadStarted: false,
    refreshTimer: null
  },
  {
    id: 'phishing',
    url: 'https://malware-filter.gitlab.io/malware-filter/phishing-filter.txt',
    cachePath: path.join(userDataPath, 'adblock-phishing-engine.bin'),
    engine: null,
    loadStarted: false,
    refreshTimer: null
  }
]

var adblockCosmeticPreloadPath = null
try {
  adblockCosmeticPreloadPath = require.resolve('@ghostery/adblocker-electron-preload')
} catch (e) { }
const adblockCosmeticPreloads = new Map() // session: preload id
const adblockCosmeticInjectChannel = '@ghostery/adblocker/inject-cosmetic-filters'
const adblockCosmeticMutationChannel = '@ghostery/adblocker/is-mutation-observer-enabled'
var adblockCosmeticHandlersRegistered = false

function adblockEngineCaching () {
  return {
    path: adblockEnginePath,
    read: function (p) {
      return fs.promises.readFile(p)
    },
    write: function (p, buffer) {
      return fs.promises.writeFile(p, buffer)
    }
  }
}

function adblockIsStale (cachePath) {
  try {
    return (Date.now() - fs.statSync(cachePath).mtimeMs) > adblockRefreshInterval
  } catch (e) {
    return true
  }
}

function adblockLoadEngine () {
  if (adblockEngineLoadStarted) {
    return
  }
  adblockEngineLoadStarted = true
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, adblockEngineCaching()).then(function (engine) {
    adblockEngine = engine
    adblockScheduleEngineRefresh(adblockIsStale(adblockEnginePath) ? 5000 : adblockRefreshInterval)
  }).catch(function (err) {
    console.warn('failed to load the adblock engine', err)
    adblockEngineLoadStarted = false
    setTimeout(adblockLoadEngine, 15 * 60 * 1000)
  })
}

function adblockScheduleEngineRefresh (delay) {
  clearTimeout(adblockEngineRefreshTimer)
  adblockEngineRefreshTimer = setTimeout(function () {
    if (enabledFilteringOptions.blockingLevel === 0) {
      adblockScheduleEngineRefresh(adblockRefreshInterval)
      return
    }
    adblockRefreshEngine()
  }, delay)
}

function adblockRefreshEngine () {
  if (adblockEngineRefreshing) {
    return
  }
  adblockEngineRefreshing = true
  // no caching argument: always fetches and parses the lists afresh
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then(function (engine) {
    adblockEngine = engine
    return fs.promises.writeFile(adblockEnginePath, engine.serialize())
  }).catch(function (err) {
    console.warn('failed to refresh the adblock engine', err)
  }).then(function () {
    adblockEngineRefreshing = false
    adblockScheduleEngineRefresh(adblockRefreshInterval)
  })
}

function adblockMalwareParse (text) {
  return FiltersEngine.parse(text, {
    loadCosmeticFilters: false,
    loadGenericCosmeticsFilters: false,
    loadCSPFilters: false,
    enableMutationObserver: false,
    loadExtendedSelectors: false
  })
}

function adblockFetchMalwareList (list) {
  return fetch(list.url).then(function (response) {
    if (!response.ok) {
      throw new Error('filter list fetch failed with status ' + response.status)
    }
    return response.text()
  }).then(function (text) {
    var engine = adblockMalwareParse(text)
    return fs.promises.writeFile(list.cachePath, engine.serialize()).then(function () {
      return engine
    })
  })
}

function adblockRefreshMalwareEngine (list) {
  adblockFetchMalwareList(list).then(function (engine) {
    list.engine = engine
    adblockScheduleMalwareRefresh(list, adblockRefreshInterval)
  }).catch(function (err) {
    // the prebuilt ad engine must keep working even when these lists fail
    console.warn('failed to refresh the ' + list.id + ' filter list', err)
    adblockScheduleMalwareRefresh(list, 15 * 60 * 1000)
  })
}

function adblockScheduleMalwareRefresh (list, delay) {
  clearTimeout(list.refreshTimer)
  list.refreshTimer = setTimeout(function () {
    if (enabledFilteringOptions.blockingLevel === 0) {
      adblockScheduleMalwareRefresh(list, adblockRefreshInterval)
      return
    }
    adblockRefreshMalwareEngine(list)
  }, Math.min(Math.max(delay, 30 * 1000), adblockRefreshInterval))
}

function adblockLoadMalwareEngine (list) {
  var age = adblockRefreshInterval
  try {
    age = Date.now() - fs.statSync(list.cachePath).mtimeMs
  } catch (e) { }
  if (age > adblockRefreshInterval) {
    adblockRefreshMalwareEngine(list)
    return
  }
  fs.promises.readFile(list.cachePath).then(function (buffer) {
    return FiltersEngine.deserialize(buffer)
  }).then(function (engine) {
    list.engine = engine
    adblockScheduleMalwareRefresh(list, adblockRefreshInterval - age)
  }).catch(function () {
    adblockRefreshMalwareEngine(list)
  })
}

function adblockEnsureEngines () {
  if (enabledFilteringOptions.blockingLevel === 0) {
    return
  }
  if (!app.isReady()) {
    if (!adblockEnginesWaitReady) {
      adblockEnginesWaitReady = true
      app.whenReady().then(function () {
        adblockEnginesWaitReady = false
        adblockEnsureEngines()
      })
    }
    return
  }
  adblockLoadEngine()
  adblockMalwareLists.forEach(function (list) {
    if (!list.loadStarted) {
      list.loadStarted = true
      adblockLoadMalwareEngine(list)
    }
  })
}

function adblockRequestFromDetails (details) {
  return Request.fromRawDetails({
    _originalRequestDetails: details,
    requestId: String(details.id),
    sourceUrl: details.referrer || '',
    tabId: details.webContentsId,
    type: details.resourceType || 'other',
    url: details.url
  })
}

/*
Returns the engine's blocking response for a (non-main-frame) request, or null
when there is nothing to check. Level 1 only blocks third-party requests, like
the old built-in filter did; requests without a known source count as
blockable.
*/
function adblockMatchRequest (details) {
  var engine = adblockEngine
  if (!engine) {
    return null
  }
  var url = details.url
  if (!(url.startsWith('http:') || url.startsWith('https:') || url.startsWith('ws:') || url.startsWith('wss:'))) {
    return null
  }
  var request = adblockRequestFromDetails(details)
  if (request.isMainFrame()) {
    return null
  }
  if (enabledFilteringOptions.blockingLevel < 2 && request.sourceHostname && !request.isThirdParty) {
    return null
  }
  return engine.match(request)
}

/*
Returns the id of the malicious-site list that matches a top-level navigation,
or null. Only current navigation targets are checked, so ordinary ad and
tracker blocks stay unaffected.
*/
function adblockMatchMalwareNavigation (urlString) {
  if (!adblockMalwareLists.some(function (list) { return list.engine })) {
    return null
  }
  var request = Request.fromRawDetails({ url: urlString, type: 'mainFrame' })
  for (var i = 0; i < adblockMalwareLists.length; i++) {
    var list = adblockMalwareLists[i]
    if (list.engine && list.engine.match(request).match) {
      return list.id
    }
  }
  return null
}

function adblockMatchPopup (urlString) {
  var engine = adblockEngine
  if (!engine || enabledFilteringOptions.blockingLevel < 2) {
    return false
  }
  var request = Request.fromRawDetails({ url: urlString, type: 'popup' })
  return engine.match(request).match
}

function adblockShowPhishingPage (webContentsId, blockedURL, listId) {
  var contents = webContentsId ? webContents.fromId(webContentsId) : null
  if (!contents || contents.isDestroyed()) {
    return
  }
  var pageURL = 'min://app/pages/phishing/index.html?url=' + encodeURIComponent(blockedURL) + '&list=' + listId
  // wait for the canceled navigation to settle before starting the new one
  setTimeout(function () {
    if (!contents.isDestroyed()) {
      contents.loadURL(pageURL).catch(function () { })
    }
  }, 0)
}

function adblockCosmeticsShouldRun (ses) {
  return enabledFilteringOptions.blockingLevel >= 2
}

function adblockApplyCosmeticsToSession (ses) {
  var enabled = adblockCosmeticsShouldRun(ses)
  var id = adblockCosmeticPreloads.get(ses)
  if (enabled && id === undefined && adblockCosmeticPreloadPath) {
    adblockEnsureCosmeticHandlers()
    try {
      adblockCosmeticPreloads.set(ses, ses.registerPreloadScript({ type: 'frame', filePath: adblockCosmeticPreloadPath }))
    } catch (e) {
      console.warn('failed to register the cosmetic filters preload', e)
    }
  } else if (!enabled && id !== undefined) {
    try {
      ses.unregisterPreloadScript(id)
    } catch (e) { }
    adblockCosmeticPreloads.delete(ses)
  }
}

function adblockSyncCosmetics () {
  registeredFilteringSessions.forEach(adblockApplyCosmeticsToSession)
}

function adblockOnFilteringLevelChanged () {
  if (enabledFilteringOptions.blockingLevel > 0) {
    if (adblockBootStarted) {
      adblockEnsureEngines()
    } else {
      adblockScheduleBootStart()
    }
  }
  adblockSyncCosmetics()
}

function adblockEnsureCosmeticHandlers () {
  if (adblockCosmeticHandlersRegistered) {
    return
  }
  adblockCosmeticHandlersRegistered = true
  ipc.handle(adblockCosmeticInjectChannel, adblockOnInjectCosmeticFilters)
  ipc.handle(adblockCosmeticMutationChannel, adblockOnIsMutationObserverEnabled)
}

function adblockTopPageURL (event) {
  try {
    return event.sender.mainFrame.url
  } catch (e) {
    return null
  }
}

function adblockCosmeticsAllowedForPage (pageURL) {
  if (!pageURL || !(pageURL.startsWith('http://') || pageURL.startsWith('https://'))) {
    return false
  }
  try {
    return !requestDomainIsException(new URL(pageURL).hostname)
  } catch (e) {
    return false
  }
}

function adblockOnInjectCosmeticFilters (event, url, msg) {
  if (enabledFilteringOptions.blockingLevel < 2) {
    return
  }
  if (!adblockCosmeticsAllowedForPage(adblockTopPageURL(event))) {
    return
  }
  var engine = adblockEngine
  if (!engine) {
    return
  }
  engine.onInjectCosmeticFilters(event, url, msg)
}

function adblockOnIsMutationObserverEnabled (event) {
  var engine = adblockEngine
  if (!engine || enabledFilteringOptions.blockingLevel < 2) {
    return false
  }
  if (!adblockCosmeticsAllowedForPage(adblockTopPageURL(event))) {
    return false
  }
  return engine.config.enableMutationObserver === true
}
