var webviews = require('webviews.js')

var sweepTimer = null

function sweep () {
  var selected = tasks.getSelected()
  if (!selected) {
    return
  }
  tasks.forEach(function (task) {
    if (task.id === selected.id) {
      return
    }
    task.tabs.get().forEach(function (tab) {
      if (tab.private || tab.hasAudio) {
        return
      }
      if (webviews.hasViewForTab(tab.id)) {
        if (webviews.captureTab) {
          webviews.captureTab(tab.id)
        }
        setTimeout(function () {
          if (webviews.hasViewForTab(tab.id) && tab.id !== tabs.getSelected()) {
            webviews.destroy(tab.id)
          }
        }, 200)
      }
    })
  })
}

function queueSweep () {
  clearTimeout(sweepTimer)
  sweepTimer = setTimeout(sweep, 1500)
}

function initialize () {
  tasks.on('task-updated', function (id, key) {
    if (key === 'selectedInWindow') {
      queueSweep()
    }
  })
  tasks.on('task-removed', function () {
    queueSweep()
  })
  setInterval(sweep, 60000)
}

module.exports = { initialize }
