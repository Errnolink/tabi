const webviews = require('webviews.js')

function keepAlive (id) {
  if (!webviews.hasViewForTab(id) || webviews.selectedId === id) {
    return
  }
  webviews.keptAlive.add(id)
  webviews.emitEvent('view-hidden', id)
}

function warmUp (tabId) {
  if (!tabId || webviews.hasViewForTab(tabId)) {
    return
  }
  var task = tasks.getTaskContainingTab(tabId)
  var tabData = task && task.tabs.get(tabId)
  if (!tabData || tabData.private || !tabData.url) {
    return
  }
  webviews.warmupTabs.add(tabId)
  webviews.add(tabId)
}

webviews.bindEvent('media-started-playing', function (tabId) {
  // only warm-up views that were never selected are killed when they start playing audio;
  // real tabs are protected by the hasAudio exemption in discardInactive
  if (webviews.warmupTabs.has(tabId)) {
    webviews.destroy(tabId)
  }
})

module.exports = { keepAlive, warmUp }
