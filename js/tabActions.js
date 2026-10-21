/* global electron */

const browserUI = require('browserUI.js')
const webviews = require('webviews.js')
const containers = require('containers.js')

function ownerOf (tabId) {
  return tasks.getTaskContainingTab(tabId)
}

function focusTask (task) {
  if (tasks.getSelected().id !== task.id) {
    browserUI.switchToTask(task.id)
  }
}

function pickNextSelected (task) {
  const next = task.tabs.get().slice().sort((a, b) => b.lastActivity - a.lastActivity)[0]
  if (next) {
    task.tabs.setSelected(next.id)
  }
}

const tabActions = {
  newTab: function (taskId, containerId) {
    const task = tasks.get(taskId) || tasks.getSelected()
    focusTask(task)
    const id = tabs.add({ containerId: containerId || containers.containerForNewTab(task.id) })
    browserUI.addTab(id)
    return id
  },

  newTabBelow: function (tabId) {
    const task = ownerOf(tabId)
    focusTask(task)
    browserUI.switchToTab(tabId)
    const source = task.tabs.get(tabId)
    const id = tabs.add({ containerId: source.containerId, private: source.private })
    browserUI.addTab(id)
  },

  duplicate: function (tabId) {
    const task = ownerOf(tabId)
    focusTask(task)
    const source = task.tabs.get(tabId)
    const id = tabs.add({ url: source.url, title: source.title, containerId: source.containerId, private: source.private })
    browserUI.addTab(id, { enterEditMode: false })
  },

  reload: function (tabId) {
    const tab = ownerOf(tabId).tabs.get(tabId)
    if (tab.url && tab.url.startsWith(webviews.internalPages.error)) {
      webviews.update(tabId, new URL(tab.url).searchParams.get('url'))
    } else if (webviews.hasViewForTab(tabId)) {
      webviews.callAsync(tabId, 'reload')
    }
  },

  toggleMute: function (tabId) {
    const task = ownerOf(tabId)
    const tab = task.tabs.get(tabId)
    if (webviews.hasViewForTab(tabId)) {
      webviews.callAsync(tabId, 'setAudioMuted', !tab.muted)
    }
    task.tabs.update(tabId, { muted: !tab.muted })
  },

  togglePin: function (tabId) {
    const task = ownerOf(tabId)
    const tab = task.tabs.get(tabId)
    const pinned = !tab.pinned
    const moved = task.tabs.splice(task.tabs.getIndex(tabId), 1)[0]
    moved.pinned = pinned
    const pinnedCount = task.tabs.get().filter(t => t.pinned).length
    task.tabs.splice(pinnedCount, 0, moved)
    task.tabs.update(tabId, { pinned })
  },

  moveToTask: function (tabId, targetTaskId) {
    const source = ownerOf(tabId)
    const target = tasks.get(targetTaskId)
    if (!source || !target || source.id === target.id) {
      return
    }
    const tab = source.tabs.splice(source.tabs.getIndex(tabId), 1)[0]
    const wasSelected = tab.selected
    if (wasSelected) {
      tab.selected = false
      pickNextSelected(source)
    }
    target.tabs.splice(target.tabs.count(), 0, tab)
    if (source.tabs.count() === 0) {
      browserUI.closeTask(source.id)
    }
    if (wasSelected && tasks.getSelected().id === source.id) {
      browserUI.switchToTask(source.id)
    }
  },

  moveToNewTask: function (tabId) {
    const id = tasks.add({}, tasks.getLength())
    tabActions.moveToTask(tabId, id)
    browserUI.switchToTask(id)
    browserUI.switchToTab(tabId)
  },

  closeOthers: function (tabId) {
    const task = ownerOf(tabId)
    focusTask(task)
    browserUI.switchToTab(tabId)
    task.tabs.get().filter(t => t.id !== tabId && !t.pinned).forEach(t => browserUI.closeTab(t.id))
  },

  closeBelow: function (tabId) {
    const task = ownerOf(tabId)
    focusTask(task)
    const index = task.tabs.getIndex(tabId)
    task.tabs.get().slice(index + 1).filter(t => !t.pinned).forEach(t => browserUI.closeTab(t.id))
  },

  close: function (tabId) {
    const task = ownerOf(tabId)
    if (task.id === tasks.getSelected().id) {
      browserUI.closeTab(tabId)
      return
    }
    task.tabs.destroy(tabId)
    webviews.destroy(tabId)
    if (task.tabs.count() === 0) {
      browserUI.closeTask(task.id)
    }
  },

  reloadTask: function (taskId) {
    tasks.get(taskId).tabs.get().forEach(t => tabActions.reload(t.id))
  },

  mergeTasks: function (sourceTaskId, targetTaskId) {
    const source = tasks.get(sourceTaskId)
    const target = tasks.get(targetTaskId)
    if (!source || !target || source.id === target.id) {
      return
    }
    const wasSelected = tasks.getSelected().id === source.id
    if (wasSelected) {
      browserUI.switchToTask(target.id)
    }
    const sourceTabs = source.tabs.get().slice()
    sourceTabs.forEach(function (tab) {
      tabActions.moveToTask(tab.id, target.id)
    })
    if (tasks.get(source.id)) {
      browserUI.closeTask(source.id)
    }
    if (wasSelected && tasks.getSelected().id !== target.id) {
      browserUI.switchToTask(target.id)
    }
  },

  merge: function (sourceTaskId, targetTaskId) {
    tabActions.mergeTasks(sourceTaskId, targetTaskId)
  },

  copyLink: function (tabId) {
    const tab = ownerOf(tabId).tabs.get(tabId)
    if (tab.url) {
      electron.clipboard.writeText(tab.url)
    }
  }
}

module.exports = tabActions
