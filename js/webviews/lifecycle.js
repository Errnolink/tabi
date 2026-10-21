var urlParser = require('util/urlParser.js')
var containers = require('containers.js')
var tabState = require('tabState.js')
const webviews = require('webviews.js')
const captures = require('webviews/captures.js')

function scrollOnLoad (tabId, scrollPosition) {
  const listener = function (eTabId) {
    if (eTabId === tabId) {
      // the scrollable content may not be available until some time after the load event, so attempt scrolling several times
      // but stop once we've successfully scrolled once so we don't overwrite user scroll attempts that happen later
      for (let i = 0; i < 3; i++) {
        var done = false
        setTimeout(function () {
          if (!done) {
            webviews.callAsync(tabId, 'executeJavaScript', `
            (function() {
              window.scrollTo(0, ${scrollPosition})
              return window.scrollY === ${scrollPosition}
            })()
            `, function (err, completed) {
              if (!err && completed) {
                done = true
              }
            })
          }
        }, 750 * i)
      }
      webviews.unbindEvent('did-finish-load', listener)
    }
  }
  webviews.bindEvent('did-finish-load', listener)
}

function setAudioMutedOnCreate (tabId, muted) {
  const listener = function () {
    webviews.callAsync(tabId, 'setAudioMuted', muted)
    webviews.unbindEvent('did-navigate', listener)
  }
  webviews.bindEvent('did-navigate', listener)
}

function add (tabId, existingViewId) {
  var tabData = tabState.getTabAnywhere(tabId)
  if (!tabData) {
    return
  }

  // needs to be called before the view is created to that its listeners can be registered
  if (tabData.scrollPosition) {
    scrollOnLoad(tabId, tabData.scrollPosition)
  }

  if (tabData.muted) {
    setAudioMutedOnCreate(tabId, tabData.muted)
  }

  // if the tab is private, we want to partition it. See http://electron.atom.io/docs/v0.34.0/api/web-view-tag/#partition
  // since tab IDs are unique, we can use them as partition names
  var partition
  if (tabData.private === true) {
    partition = tabId.toString() // options.tabId is a number, which remote.session.fromPartition won't accept. It must be converted to a string first
  } else {
    // non-private tabs run in their container's persistent partition
    partition = containers.partitionFor(tabData.containerId)
  }

  ipc.send('createView', {
    existingViewId,
    id: tabId,
    webPreferences: {
      partition: partition || 'persist:webcontent'
    },
    boundsString: JSON.stringify(webviews.getViewBounds()),
    events: webviews.events.map(e => e.event).filter((i, idx, arr) => arr.indexOf(i) === idx)
  })

  if (!existingViewId) {
    if (tabData.url) {
      ipc.send('loadURLInView', { id: tabData.id, url: urlParser.parse(tabData.url) })
    } else if (tabData.private) {
      // workaround for https://github.com/minbrowser/min/issues/872
      ipc.send('loadURLInView', { id: tabData.id, url: urlParser.parse('min://newtab') })
    }
  }

  tasks.getTaskContainingTab(tabId).tabs.update(tabId, {
    hasWebContents: true
  })
}

function setSelected (id, options) { // options.focus - whether to focus the view. Defaults to true.
  if (webviews.selectedId && webviews.selectedId !== id) {
    captures.captureTab(webviews.selectedId)
  }
  webviews.emitEvent('view-hidden', webviews.selectedId)

  webviews.selectedId = id

  // create the view if it doesn't already exist
  if (!webviews.hasViewForTab(id)) {
    webviews.add(id)
  }

  if (webviews.placeholderRequests.length > 0) {
    // update the placeholder instead of showing the actual view
    webviews.requestPlaceholder()
    return
  }

  ipc.send('setView', {
    id: id,
    bounds: webviews.getViewBounds(),
    radius: webviews.getViewRadius(),
    focus: !options || options.focus !== false
  })
  webviews.keptAlive.delete(id)
  webviews.warmupTabs.delete(id)
  webviews.emitEvent('view-shown', id)
}

function update (id, url) {
  ipc.send('loadURLInView', { id: id, url: urlParser.parse(url) })
}

function destroy (id) {
  webviews.loadingTabs.delete(id)
  webviews.keptAlive.delete(id)
  webviews.warmupTabs.delete(id)
  webviews.emitEvent('view-hidden', id)

  if (webviews.hasViewForTab(id)) {
    tabState.updateTabAnywhere(id, {
      hasWebContents: false,
      hasAudio: false
    })
  }
  // we may be destroying a view for which the tab object no longer exists, so this message should be sent unconditionally
  ipc.send('destroyView', id)

  delete webviews.viewFullscreenMap[id]
  if (webviews.selectedId === id) {
    webviews.selectedId = null
  }
}

module.exports = { add, setSelected, update, destroy }
