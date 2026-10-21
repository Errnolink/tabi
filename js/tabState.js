const TaskList = require('tabState/task.js')

function initialize () {
  window.tasks = new TaskList()
  window.tabs = undefined
}

function getTaskContainingTab (tabId) {
  return window.tasks ? window.tasks.getTaskContainingTab(tabId) : null
}

function getTabListContainingTab (tabId) {
  const task = getTaskContainingTab(tabId)
  return task ? task.tabs : null
}

function getTabAnywhere (tabId) {
  const tabs = getTabListContainingTab(tabId)
  return tabs ? tabs.get(tabId) : undefined
}

function updateTabAnywhere (tabId, data, emit = true) {
  const tabs = getTabListContainingTab(tabId)
  if (tabs) {
    tabs.update(tabId, data, emit)
  }
}

module.exports = { initialize, getTaskContainingTab, getTabListContainingTab, getTabAnywhere, updateTabAnywhere }
