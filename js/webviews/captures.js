var thumbnailStore = require('thumbnailStore.js')
const webviews = require('webviews.js')

var placeholderImg = document.getElementById('webview-placeholder')

var lastCaptureTimes = {}

function loadPlaceholderThumb (tabId, version, retried) {
  thumbnailStore.load(tabId, version).then(function (url) {
    if (url) {
      if (webviews.selectedId === tabId && webviews.placeholderRequests.length > 0) {
        placeholderImg.src = url
        placeholderImg.hidden = false
      }
      return
    }
    if (!retried) {
      setTimeout(function () {
        loadPlaceholderThumb(tabId, version, true)
      }, 300)
    }
  })
}

function captureTab (tabId, options) {
  if (!tabId || document.visibilityState === 'hidden') {
    return
  }
  var task = tasks.getTaskContainingTab(tabId)
  var tab = task && task.tabs.get(tabId)
  if (!tab || tab.private) {
    // don't capture placeholders or thumbnails for private tabs
    return
  }

  if (webviews.placeholderRequests.length > 0 && !(options && options.forceCapture === true)) {
    // capturePage doesn't work while the view is hidden
    return
  }

  var forceCapture = options && options.forceCapture === true
  var now = Date.now()
  if (!forceCapture && now - (lastCaptureTimes[tabId] || 0) < 2000) {
    return
  }
  lastCaptureTimes[tabId] = now

  ipc.send('getCapture', {
    id: tabId,
    width: 480,
    needsLarge: forceCapture || webviews.placeholderRequests.length > 0
  })
}

function captureCurrentTab (options) {
  captureTab(tabs.getSelected(), options)
}

function requestPlaceholder (reason) {
  if (reason && !webviews.placeholderRequests.includes(reason)) {
    webviews.placeholderRequests.push(reason)
  }
  if (webviews.placeholderRequests.length >= 1) {
    // create a new placeholder

    var associatedTab = tasks.getTaskContainingTab(webviews.selectedId).tabs.get(webviews.selectedId)
    var thumbUrl = associatedTab ? thumbnailStore.peek(webviews.selectedId, associatedTab.thumbVersion) : null
    if (thumbUrl) {
      placeholderImg.src = thumbUrl
      placeholderImg.hidden = false
    } else if (associatedTab && associatedTab.url) {
      var placeholderTabId = webviews.selectedId
      loadPlaceholderThumb(placeholderTabId, associatedTab.thumbVersion)
      captureCurrentTab({ forceCapture: true })
    } else {
      placeholderImg.hidden = true
    }
  }
  setTimeout(function () {
    // wait to make sure the image is visible before the view is hidden
    // make sure the placeholder was not removed between when the timeout was created and when it occurs
    if (webviews.placeholderRequests.length > 0) {
      ipc.send('hideCurrentView')
      webviews.emitEvent('view-hidden', webviews.selectedId)
    }
  }, 0)
}

function hidePlaceholder (reason) {
  if (webviews.placeholderRequests.includes(reason)) {
    webviews.placeholderRequests.splice(webviews.placeholderRequests.indexOf(reason), 1)
  }

  if (webviews.placeholderRequests.length === 0) {
    // multiple things can request a placeholder at the same time, but we should only show the view again if nothing requires a placeholder anymore
    if (webviews.hasViewForTab(webviews.selectedId)) {
      ipc.send('setView', {
        id: webviews.selectedId,
        bounds: webviews.getViewBounds(),
        radius: webviews.getViewRadius(),
        focus: true
      })
      webviews.keptAlive.delete(webviews.selectedId)
      webviews.emitEvent('view-shown', webviews.selectedId)
    }
    // wait for the view to be visible before removing the placeholder
    setTimeout(function () {
      if (webviews.placeholderRequests.length === 0) { // make sure the placeholder hasn't been re-enabled
        placeholderImg.hidden = true
      }
    }, 400)
  }
}

ipc.on('captureData', function (e, data) {
  const task = tasks.getTaskContainingTab(data.id)
  if (!task) {
    return
  }
  const tab = task.tabs.get(data.id)
  if (!tab) {
    return
  }
  if (typeof data.aspect === 'number' && isFinite(data.aspect) && data.aspect > 0) {
    const current = tab.thumbAspect
    const unchanged = typeof current === 'number' && isFinite(current) && current > 0 && Math.abs(current - data.aspect) / data.aspect <= 0.01
    if (!unchanged) {
      task.tabs.update(data.id, { thumbAspect: data.aspect })
    }
  }
  if (typeof data.version === 'number' && data.version !== tab.thumbVersion) {
    task.tabs.update(data.id, { thumbVersion: data.version })
  }
  if (data.id === webviews.selectedId && webviews.placeholderRequests.length > 0) {
    thumbnailStore.forget(data.id)
    thumbnailStore.load(data.id, tab.thumbVersion).then(function (url) {
      if (url && data.id === webviews.selectedId && webviews.placeholderRequests.length > 0) {
        placeholderImg.src = url
        placeholderImg.hidden = false
      }
    })
  }
})

tasks.on('tab-destroyed', function (id) {
  delete lastCaptureTimes[id]
  webviews.keptAlive.delete(id)
  ipc.send('deleteThumbnail', id)
})

module.exports = { captureTab, captureCurrentTab, requestPlaceholder, hidePlaceholder }
