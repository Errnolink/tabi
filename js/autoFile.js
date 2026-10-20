var fs = require('fs')

var browserUI = require('browserUI.js')
var webviews = require('webviews.js')

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
  return tasks.add({ name: rule.name })
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
  var rule = ruleFor(tab.url)
  if (!rule) {
    return
  }
  var target = taskForRule(rule)
  if (target.id === containing.id) {
    return
  }

  var wasSelectedTab = containing.id === tasks.getSelected().id && tabId === tabs.getSelected()

  containing.tabs.destroy(tabId)
  if (containing.tabs.count() === 0) {
    containing.tabs.add()
  }
  webviews.destroy(tabId)
  target.tabs.add(tab, { atEnd: true })

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
  tasks.on('tab-added', function (tabId) {
    queueFile(tabId)
  })
  tasks.on('tab-updated', function (id, key) {
    if (key === 'url') {
      queueFile(id)
    }
  })
  setTimeout(function () {
    armed = true
  }, 3000)
}

module.exports = { initialize }
