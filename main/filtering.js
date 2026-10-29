var defaultFilteringSettings = {
  blockingLevel: 1,
  contentTypes: [],
  exceptionDomains: []
}

var enabledFilteringOptions = {
  blockingLevel: 0,
  contentTypes: [], // script, image
  exceptionDomains: []
}

// for tracking the number of blocked requests
var unsavedBlockedRequests = 0

function flushBlockedRequestCount () {
  if (unsavedBlockedRequests <= 0) {
    return
  }
  var current = settings.get('filteringBlockedCount')
  if (!current) {
    current = 0
  }
  settings.set('filteringBlockedCount', current + unsavedBlockedRequests)
  unsavedBlockedRequests = 0
}

setInterval(flushBlockedRequestCount, 5 * 60 * 1000)

var blockedCountQuitFlushQueued = false

app.on('before-quit', function (e) {
  if (unsavedBlockedRequests <= 0 || blockedCountQuitFlushQueued) {
    return
  }
  blockedCountQuitFlushQueued = true
  e.preventDefault()
  try {
    flushBlockedRequestCount()
  } catch (err) {
    app.quit()
    return
  }
  var pendingWrite = settings.fileWritePromise || Promise.resolve()
  Promise.race([
    pendingWrite,
    new Promise(function (resolve) {
      setTimeout(resolve, 1500)
    })
  ]).then(function () {
    app.quit()
  }).catch(function () {
    app.quit()
  })
})

function removeWWW (domain) {
  return domain.replace(/^www\./i, '')
}

function requestDomainIsException (domain) {
  return enabledFilteringOptions.exceptionDomains.includes(removeWWW(domain))
}

/*
the domain of the page a request belongs to; null when the request is not
associated with a webContents
*/
function pageDomainForRequest (details) {
  if (!details.webContentsId) {
    return null
  }
  try {
    var url = webContents.fromId(details.webContentsId).getURL()
    return url ? new URL(url).hostname : null
  } catch (e) {
    return null
  }
}

function navigationDomain (urlString) {
  try {
    return new URL(urlString).hostname
  } catch (e) {
    return null
  }
}

function requestDomainIsWhitelistedFromPhishing (domain) {
  if (!domain) {
    return false
  }
  var list = settings.get('phishingWhitelist')
  if (!Array.isArray(list)) {
    return false
  }
  return list.includes(domain) || list.includes(removeWWW(domain))
}

function filterPopups (url) {
  if (!/^https?:\/\//i.test(url)) {
    return true
  }
  if (enabledFilteringOptions.blockingLevel === 0) {
    return true
  }

  try {
    if (requestDomainIsException(new URL(url).hostname)) {
      return true
    }
  } catch (e) {
    return true
  }

  if (adblockMatchPopup(url)) {
    unsavedBlockedRequests++
    return false
  }

  return true
}

function handleRequest (details, callback) {
  /* eslint-disable standard/no-callback-literal */
  var requestHeaders = details.requestHeaders
  var isMainFrame = details.resourceType === 'mainFrame'
  var domain = pageDomainForRequest(details)
  var isExceptionDomain = domain && requestDomainIsException(domain)
  var modifiedURL = null

  // malicious-site and phishing lists, checked against the navigation target;
  // only the target's own exception status applies here, not the current page's
  if (isMainFrame && enabledFilteringOptions.blockingLevel > 0 && /^https?:\/\//i.test(details.url)) {
    var navDomain = navigationDomain(details.url)
    if (!requestDomainIsWhitelistedFromPhishing(navDomain) && !requestDomainIsException(navDomain)) {
      var malwareList = adblockMatchMalwareNavigation(details.url)
      if (malwareList) {
        callback({
          cancel: true,
          requestHeaders: requestHeaders
        })
        adblockShowPhishingPage(details.webContentsId, details.url, malwareList)
        return
      }
    }
  }

  // tracking-parameter stripping, tracking-redirect skipping and de-AMP
  if (urlCleaningEnabled() && (isMainFrame || details.resourceType === 'subFrame')) {
    modifiedURL = urlCleanNavigationURL(details.url, isMainFrame)
  }

  // block javascript and images if needed

  if (enabledFilteringOptions.contentTypes.length > 0) {
    for (var i = 0; i < enabledFilteringOptions.contentTypes.length; i++) {
      if (details.resourceType === enabledFilteringOptions.contentTypes[i]) {
        callback({
          cancel: true,
          requestHeaders: requestHeaders
        })
        return
      }
    }
  }

  // ad and tracker blocking
  if (!isExceptionDomain && enabledFilteringOptions.blockingLevel > 0) {
    var response = adblockMatchRequest(details)
    if (response) {
      if (response.match) {
        unsavedBlockedRequests++

        callback({
          cancel: true,
          requestHeaders: requestHeaders
        })
        return
      }
      if (response.redirect && response.redirect.dataUrl) {
        modifiedURL = response.redirect.dataUrl
      }
    }
  }

  callback({
    cancel: false,
    requestHeaders: requestHeaders,
    redirectURL: modifiedURL || undefined
  })
  /* eslint-enable standard/no-callback-literal */
}

function setFilteringSettings (value) {
  if (!value) {
    value = {}
  }

  for (var key in defaultFilteringSettings) {
    if (value[key] === undefined) {
      value[key] = defaultFilteringSettings[key]
    }
  }

  enabledFilteringOptions.contentTypes = value.contentTypes
  enabledFilteringOptions.blockingLevel = value.blockingLevel
  enabledFilteringOptions.exceptionDomains = value.exceptionDomains.map(d => removeWWW(d))

  adblockOnFilteringLevelChanged()
}

var registeredFilteringSessions = new Set()

function registerFiltering (ses) {
  registeredFilteringSessions.add(ses)
  ses.webRequest.onBeforeRequest(handleRequest)
  adblockApplyCosmeticsToSession(ses)
}

app.once('ready', function () {
  registerFiltering(session.defaultSession)
})

app.on('session-created', registerFiltering)

settings.listen('filtering', function (value) {
  // migrate from old settings (<v1.9.0)
  if (value && typeof value.trackers === 'boolean') {
    if (value.trackers === true) {
      value.blockingLevel = 2
    } else if (value.trackers === false) {
      value.blockingLevel = 0
    }
    delete value.trackers
    settings.set('filtering', value)
  }

  setFilteringSettings(value)
})
