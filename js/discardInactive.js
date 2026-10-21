var webviews = require('webviews.js')
var settings = require('util/settings/settings.js')

var DEFAULT_SLEEP_MINUTES = 60
var GB = 1024 * 1024 * 1024
var MIN_PRESSURE_BYTES = 1 * GB
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

function pressureThresholdBytes () {
  if (!budget || !budget.totalBytes) {
    return MIN_PRESSURE_BYTES
  }
  return Math.max(MIN_PRESSURE_BYTES, 0.08 * budget.totalBytes)
}

function systemMemoryPressure () {
  return !!budget && budget.availableBytes > 0 && budget.availableBytes < pressureThresholdBytes()
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

function isSelectedAnywhere (task, tabId) {
  return !!task.selectedInWindow && task.tabs.getSelected() === tabId
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
    scale = Math.min(6, Math.max(0.25, (budget.availableBytes / GB) / (0.1 * (budget.totalBytes / GB))))
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
      if (tab.private || tab.pinned || tab.hasAudio) {
        return
      }
      if (isSelectedAnywhere(task, tab.id)) {
        return
      }
      if (!webviews.hasViewForTab(tab.id)) {
        return
      }
      var lastUsed = Math.max(tab.lastActivity || 0, lastSeen[tab.id] || 0)
      candidates.push({ id: tab.id, lastUsed: lastUsed })
    })
  })
  candidates.sort(function (a, b) {
    return a.lastUsed - b.lastUsed
  })

  var pressure = systemMemoryPressure()
  var availableBytes = (budget && budget.availableBytes) || 0
  var remainingBytes = usedBytes()
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i]
    var bytes = (budget && budget.viewBytes && budget.viewBytes[candidate.id]) || 0
    if (pressure) {
      if (availableBytes >= pressureThresholdBytes() + PRESSURE_MARGIN_BYTES) {
        break
      }
      webviews.destroy(candidate.id)
      availableBytes += bytes
    } else if (remainingBytes > budgetBytes()) {
      webviews.destroy(candidate.id)
      remainingBytes -= bytes
    } else if (limit !== null && now - candidate.lastUsed > limit && !webviews.keptAlive.has(candidate.id)) {
      webviews.keepAlive(candidate.id)
    }
  }
}

function sweep () {
  markVisible()
  sweepPass(Date.now(), underMemoryPressure() ? null : effectiveSleepMs())
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
