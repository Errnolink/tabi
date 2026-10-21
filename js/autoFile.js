var fs = require('fs')

var browserUI = require('browserUI.js')
var tabActions = require('tabActions.js')

var configPath = window.globalArgs['user-data-path'] + (platformType === 'windows' ? '\\autofile.json' : '/autofile.json')

var defaultRules = [
  {
    name: 'Home',
    patterns: ['x.com/home', 'x.com/notifications', 'x.com/messages', 'x.com/i/']
  },
  {
    name: 'Search',
    patterns: ['x.com/search', 'x.com/explore']
  },
  {
    name: 'Reading',
    patterns: ['x.com/', 'twitter.com/']
  }
]

var rules = []
var armed = false
var pendingMoves = {}
var youngTabs = {}

function loadRules () {
  try {
    var data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (data && Array.isArray(data.rules) && data.rules.length > 0) {
      return data.rules
    }
  } catch (e) { }
  fs.writeFileSync(configPath, JSON.stringify({ rules: defaultRules }, null, 2))
  return defaultRules
}

function ruleFor (url) {
  if (!url) {
    return null
  }
  var u = url.toLowerCase()
  if (u.indexOf('https://x.com') !== 0 && u.indexOf('https://twitter.com') !== 0 && u.indexOf('http://x.com') !== 0) {
    return null
  }
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
  if (!armed) {
    return
  }
  clearTimeout(pendingMoves[tabId])
  pendingMoves[tabId] = setTimeout(function () {
    fileTab(tabId)
  }, 250)
}

function initialize () {
  rules = loadRules()
  tasks.on('tab-added', function (tabId, tab) {
    if (tab && tab.url) {
      return
    }
    youngTabs[tabId] = true
  })
  tasks.on('tab-updated', function (id, key) {
    if (key === 'url' && youngTabs[id]) {
      queueFile(id)
    }
  })
  setTimeout(function () {
    armed = true
  }, 3000)
}

module.exports = { initialize }
