var urlParser = require('util/urlParser.js')
var shellLayout = require('shellLayout.js')

/* implements selecting webviews, switching between them, and creating new ones. */

const webviews = {
  viewFullscreenMap: {}, // tabId, isFullscreen
  selectedId: null,
  placeholderRequests: [],
  asyncCallbacks: {},
  internalPages: {
    error: 'min://app/pages/error/index.html'
  },
  events: [],
  IPCEvents: [],
  viewMargins: [0, 0, 0, 0], // top, right, bottom, left
  loadingTabs: new Set(),
  keptAlive: new Set(),
  warmupTabs: new Set(),

  hasViewForTab: function (tabId) {
    return tabId && tasks.getTaskContainingTab(tabId) && tasks.getTaskContainingTab(tabId).tabs.get(tabId).hasWebContents
  },
  bindEvent: function (event, fn) {
    webviews.events.push({
      event: event,
      fn: fn
    })
  },
  unbindEvent: function (event, fn) {
    for (var i = 0; i < webviews.events.length; i++) {
      if (webviews.events[i].event === event && webviews.events[i].fn === fn) {
        webviews.events.splice(i, 1)
        i--
      }
    }
  },
  emitEvent: function (event, tabId, args) {
    if (!webviews.hasViewForTab(tabId)) {
      // the view could have been destroyed between when the event was occured and when it was recieved in the UI process, see https://github.com/minbrowser/min/issues/604#issuecomment-419653437
      return
    }
    webviews.events.forEach(function (ev) {
      if (ev.event === event) {
        ev.fn.apply(this, [tabId].concat(args))
      }
    })
  },
  bindIPC: function (name, fn) {
    webviews.IPCEvents.push({
      name: name,
      fn: fn
    })
  },
  adjustMargin: function (margins) {
    for (var i = 0; i < margins.length; i++) {
      webviews.viewMargins[i] += margins[i]
    }
    webviews.resize()
  },
  getViewBounds: function () {
    if (webviews.viewFullscreenMap[webviews.selectedId]) {
      return {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
    const rect = shellLayout.pageRect()
    const viewMargins = webviews.viewMargins
    return {
      x: rect.x + Math.round(viewMargins[3]),
      y: rect.y + Math.round(viewMargins[0]),
      width: Math.max(0, rect.width - Math.round(viewMargins[1] + viewMargins[3])),
      height: Math.max(0, rect.height - Math.round(viewMargins[0] + viewMargins[2]))
    }
  },
  getViewRadius: function () {
    return webviews.viewFullscreenMap[webviews.selectedId] ? 0 : shellLayout.pageRadius
  },
  isLoading: function (id) {
    return webviews.loadingTabs.has(id)
  },
  releaseFocus: function () {
    ipc.send('focusMainWebContents')
  },
  focus: function () {
    if (webviews.selectedId) {
      ipc.send('focusView', webviews.selectedId)
    }
  },
  resize: function (options) {
    ipc.send('setBounds', {
      id: webviews.selectedId,
      bounds: webviews.getViewBounds(),
      radius: webviews.getViewRadius(),
      animate: !!(options && options.animate)
    })
  },
  goBackIgnoringRedirects: async function (id) {
    const navHistory = await webviews.getNavigationHistory(id)
    // If the current page is an internal page resulting from a redirect (error pages or reader mode), go back two pages

    var url = navHistory.entries[navHistory.activeIndex].url

    if (urlParser.isInternalURL(url) && navHistory.activeIndex > 1 && navHistory.entries[navHistory.activeIndex - 1].url === urlParser.getSourceURL(url)) {
      webviews.callAsync(id, 'canGoToOffset', -2, function (err, result) {
        if (!err && result === true) {
          webviews.callAsync(id, 'goToOffset', -2)
        } else {
          webviews.callAsync(id, 'goBack')
        }
      })
    } else {
      webviews.callAsync(id, 'goBack')
    }
  },
  /*
  Can be called as
  callAsync(id, method, args, callback) -> invokes method with args, runs callback with (err, result)
  callAsync(id, method, callback) -> invokes method with no args, runs callback with (err, result)
  callAsync(id, property, value, callback) -> sets property to value
  callAsync(id, property, callback) -> reads property, runs callback with (err, result)
   */
  callAsync: function (id, method, argsOrCallback, callback) {
    var args = argsOrCallback
    var cb = callback
    if (argsOrCallback instanceof Function && !cb) {
      args = []
      cb = argsOrCallback
    }
    if (!(args instanceof Array)) {
      args = [args]
    }
    if (cb) {
      var callId = Math.random()
      webviews.asyncCallbacks[callId] = cb
    }
    ipc.send('callViewMethod', { id: id, callId: callId, method: method, args: args })
  },
  getNavigationHistory: function (id) {
    return ipc.invoke('getNavigationHistory', id)
  }
}

module.exports = webviews

const captures = require('webviews/captures.js')
const lifecycle = require('webviews/lifecycle.js')
const warmup = require('webviews/warmup.js')

webviews.captureTab = captures.captureTab
webviews.captureCurrentTab = captures.captureCurrentTab
webviews.requestPlaceholder = captures.requestPlaceholder
webviews.hidePlaceholder = captures.hidePlaceholder
webviews.add = lifecycle.add
webviews.setSelected = lifecycle.setSelected
webviews.update = lifecycle.update
webviews.destroy = lifecycle.destroy
webviews.keepAlive = warmup.keepAlive
webviews.warmUp = warmup.warmUp

require('webviews/bindings.js')
