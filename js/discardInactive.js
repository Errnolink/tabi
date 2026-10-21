var webviews = require('webviews.js')
var settings = require('util/settings/settings.js')

var DEFAULT_SLEEP_MINUTES = 60
var GB = 1024 * 1024 * 1024
var FREE_PRESSURE_BYTES = 1 * GB
var PRESSURE_MARGIN_BYTES = 256 * 1024 * 1024
var lastSeen = {}
var visibleTab = null
var budget = null

ipc.on('memoryBudget', function (e, data) {
  budget = data
})
ipc.send('getMemoryBudget')

function budgetBytes () {
  return budget && budget.budgetBytes ? budget.budgetBytes : Infinity
}

function usedBytes () {
  var total = 0
  if (budget && budget.viewBytes) {
    for (var id in budget.viewBytes) {
      total += budget.viewBytes[id]
    }
  }
  return total
}

function systemMemoryPressure () {
  return !!budget && budget.freeBytes > 0 && budget.freeBytes < FREE_PRESSURE_BYTES
}

function underMemoryPressure () {
  if (!budget) {
    return false
  }
  if (systemMemoryPressure()) {
    return true
  }
  return !!budget.budgetBytes && usedBytes() > budget.budgetBytes
}

function effectiveSleepMs () {
  var minutes = settings.get('tabSleepMinutes')
  if (minutes === undefined || minutes === null) {
    minutes = DEFAULT_SLEEP_MINUTES
  }
  if (minutes <= 0) {
    return null
  }
  var scale = 1
  if (budget && budget.totalBytes > 0) {
    scale = Math.min(6, Math.max(0.25, (budget.freeBytes / GB) / (0.1 * (budget.totalBytes / GB))))
  }
  return minutes * scale * 60 * 1000
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

function sweepPass (now, limit) {
  var candidates = []
  tasks.forEach(function (task) {
    task.tabs.get().forEach(function (tab) {
      if (tab.id === visibleTab || tab.private || tab.pinned || tab.hasAudio) {
        return
      }
      if (!webviews.hasViewForTab(tab.id) || webviews.detachedTabs.has(tab.id)) {
        return
      }
      var lastUsed = Math.max(tab.lastActivity || 0, lastSeen[tab.id] || 0)
      if (limit !== null && now - lastUsed <= limit) {
        return
      }
      candidates.push({ id: tab.id, lastUsed: lastUsed })
    })
  })
  candidates.sort(function (a, b) {
    return a.lastUsed - b.lastUsed
  })

  var pressure = systemMemoryPressure()
  var freeEstimate = (budget && budget.freeBytes) || 0
  var remainingBytes = usedBytes()
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i]
    if (candidate.id === tabs.getSelected()) {
      continue
    }
    var bytes = (budget && budget.viewBytes && budget.viewBytes[candidate.id]) || 0
    if (pressure) {
      if (freeEstimate >= FREE_PRESSURE_BYTES + PRESSURE_MARGIN_BYTES) {
        break
      }
      webviews.destroy(candidate.id)
      freeEstimate += bytes
    } else if (remainingBytes <= budgetBytes()) {
      webviews.detach(candidate.id)
    } else {
      webviews.destroy(candidate.id)
      remainingBytes -= bytes
    }
  }
}

function sweep () {
  markVisible()
  var now = Date.now()

  if (underMemoryPressure()) {
    sweepPass(now, null)
    return
  }

  var limit = effectiveSleepMs()
  if (limit) {
    sweepPass(now, limit)
  }
}

function canWarmUp () {
  return !underMemoryPressure()
}

function initialize () {
  tasks.on('tab-selected', markVisible)
  tasks.on('task-selected', markVisible)
  tasks.on('tab-destroyed', function (id) {
    delete lastSeen[id]
  })
  setInterval(sweep, 60000)
}

module.exports = { initialize, canWarmUp }
