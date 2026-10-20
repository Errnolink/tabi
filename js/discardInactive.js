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
        webviews.destroy(tab.id)
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
