var fs = require('fs')

var browserUI = require('browserUI.js')
var tabActions = require('tabActions.js')
var settings = require('util/settings/settings.js')

var configPath = window.globalArgs['user-data-path'] + (platformType === 'windows' ? '\\autofile.json' : '/autofile.json')

var rules = []
var armed = false
var pendingMoves = {}
var youngTabs = {}

function sanitizeRules (value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(function (rule) {
    return rule &&
      typeof rule.name === 'string' && rule.name.trim().length > 0 &&
      Array.isArray(rule.patterns) && rule.patterns.length > 0 &&
      rule.patterns.every(function (pattern) { return typeof pattern === 'string' && pattern.trim().length > 0 })
  }).map(function (rule) {
    return {
      name: rule.name.trim(),
      patterns: rule.patterns.map(function (pattern) { return pattern.trim() })
    }
  })
}

function writeRulesFile (nextRules) {
  if (nextRules.length === 0) {
    try {
      if (!fs.existsSync(configPath)) {
        return
      }
    } catch (e) {
      return
    }
  }
  try {
    fs.writeFileSync(configPath, JSON.stringify({ rules: nextRules }, null, 2))
  } catch (e) { }
}

function readRulesFile () {
  try {
    var data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (data && Array.isArray(data.rules)) {
      return sanitizeRules(data.rules)
    }
  } catch (e) { }
  return null
}

function loadRules () {
  var saved = sanitizeRules(settings.get('autoFileRules'))
  if (saved.length > 0) {
    return saved
  }
  var fromFile = readRulesFile()
  if (fromFile && fromFile.length > 0) {
    settings.set('autoFileRules', fromFile)
    return fromFile
  }
  return []
}

function ruleFor (url) {
  if (!url || rules.length === 0) {
    return null
  }
  var u = url.toLowerCase()
  for (var i = 0; i < rules.length; i++) {
    var patterns = rules[i].patterns
    for (var j = 0; j < patterns.length; j++) {
      if (u.indexOf(patterns[j].toLowerCase()) !== -1) {
        return rules[i]
      }
    }
  }
  return null
}

function taskForRule (rule) {
  var existing = tasks.find(function (t) {
    return (t.name || '').toLowerCase() === rule.name.toLowerCase()
  })
  if (existing) {
    return existing
  }
  return tasks.get(tasks.add({ name: rule.name }))
}

function fileTab (tabId) {
  delete pendingMoves[tabId]
  var containing = tasks.getTaskContainingTab(tabId)
  if (!containing) {
    return
  }
  var tab = containing.tabs.get(tabId)
  if (!tab || tab.private) {
    return
  }
  if (tab.url) {
    delete youngTabs[tabId]
  } else {
    return
  }
  var rule = ruleFor(tab.url)
  if (!rule) {
    return
  }
  var target = taskForRule(rule)
  if (target.id === containing.id) {
    return
  }

  // a moved tab keeps its container, so it can only move into buckets whose default container matches (or that have none)
  if (target.defaultContainerId && require('containers.js').sanitizeContainerId(tab.containerId) !== target.defaultContainerId) {
    return
  }

  var wasSelectedTab = containing.id === tasks.getSelected().id && tabId === tabs.getSelected()

  if (containing.tabs.count() === 1) {
    containing.tabs.add({ containerId: tab.containerId }, { atEnd: true })
  }
  tabActions.moveToTask(tabId, target.id)

  if (wasSelectedTab) {
    browserUI.switchToTask(target.id)
    browserUI.switchToTab(tabId)
  }
}

function queueFile (tabId) {
  if (!armed || rules.length === 0) {
    return
  }
  clearTimeout(pendingMoves[tabId])
  pendingMoves[tabId] = setTimeout(function () {
    fileTab(tabId)
  }, 250)
}

function initialize () {
  rules = loadRules()

  settings.listen('autoFileRules', function (value) {
    rules = sanitizeRules(value)
    writeRulesFile(rules)
  })

  tasks.on('tab-added', function (tabId, tab) {
    if (rules.length === 0) {
      return
    }
    if (tab && tab.url) {
      return
    }
    youngTabs[tabId] = true
  })
  tasks.on('tab-updated', function (id, key) {
    if (rules.length === 0) {
      return
    }
    if (key === 'url' && youngTabs[id]) {
      queueFile(id)
    }
  })
  setTimeout(function () {
    armed = true
  }, 3000)
}

module.exports = {
  initialize: initialize,
  getRules: function () {
    return rules.slice()
  },
  setRules: function (nextRules) {
    settings.set('autoFileRules', sanitizeRules(nextRules))
  }
}
