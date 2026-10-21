var webviews = require('webviews.js')
var settings = require('util/settings/settings.js')

var DEFAULT_SLEEP_MINUTES = 60
var lastSeen = {}
var visibleTab = null

function sleepAfterMs () {
  var minutes = settings.get('tabSleepMinutes')
  if (minutes === undefined || minutes === null) {
    minutes = DEFAULT_SLEEP_MINUTES
  }
  return minutes > 0 ? minutes * 60 * 1000 : null
}

function markVisible () {
  var now = Date.now()
  if (visibleTab) {
    lastSeen[visibleTab] = now
  }
  visibleTab = window.tabs ? tabs.getSelected() : null
  if (visibleTab) {
    lastSeen[visibleTab] = now
  }
}

function sweep () {
  var limit = sleepAfterMs()
  if (!limit) {
    return
  }
  markVisible()
  var now = Date.now()
  tasks.forEach(function (task) {
    task.tabs.get().forEach(function (tab) {
      if (tab.id === visibleTab || tab.private || tab.pinned || tab.hasAudio || !webviews.hasViewForTab(tab.id)) {
        return
      }
      if (now - Math.max(tab.lastActivity || 0, lastSeen[tab.id] || 0) > limit) {
        webviews.destroy(tab.id)
      }
    })
  })
}

function initialize () {
  tasks.on('tab-selected', markVisible)
  tasks.on('task-selected', markVisible)
  tasks.on('tab-destroyed', function (id) {
    delete lastSeen[id]
  })
  setInterval(sweep, 60000)
}

module.exports = { initialize }
