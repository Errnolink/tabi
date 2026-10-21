/*
Receives the tab-import payload (relayed by main from the min://app/pages/import
page) and creates buckets and tabs in this window's task list. Tabs are added
without web contents — views are only created if the tab gets selected, so
importing a few hundred tabs costs no RAM. Also keeps main's cached bucket
list in sync so the import page can offer "into bucket X".
*/

/* global ipc, tasks, l */

var containers = require('containers.js')

var bucketSyncQueued = false

function syncBuckets () {
  if (bucketSyncQueued) {
    return
  }
  bucketSyncQueued = true
  setTimeout(function () {
    bucketSyncQueued = false
    var list = []
    tasks.forEach(function (task) {
      list.push({ id: task.id, name: task.name })
    })
    ipc.send('import:bucket-sync', list)
  }, 0)
}

function resolveContainerId (wanted) {
  if (wanted && wanted !== 'default' && containers.get(wanted)) {
    return wanted
  }
  return 'default'
}

function addBucketTabs (task, tabs, containerId, selectFirst) {
  tabs.forEach(function (tab, index) {
    task.tabs.add({
      url: tab.url,
      title: tab.title,
      containerId: containerId,
      selected: selectFirst && index === 0
    }, { atEnd: true })
  })
}

function createImportedTabs (data) {
  var containerId = resolveContainerId(data.containerId)
  var windowsList = Array.isArray(data.windows) ? data.windows : []
  var perWindow = data.mode !== 'existing'

  windowsList.forEach(function (windowData, index) {
    var taskId
    var isNewBucket = true
    if (perWindow) {
      taskId = tasks.add({
        name: windowsList.length > 1 ? l('importWindowBucketName').replace('%s', data.sourceName || '').replace('%n', index + 1) : data.sourceName
      })
    } else {
      var existing = tasks.get(data.bucketId)
      if (existing) {
        taskId = existing.id
        isNewBucket = false
      } else {
        taskId = tasks.add({ name: data.sourceName || 'Imported Tabs' })
      }
    }
    addBucketTabs(tasks.get(taskId), windowData.tabs || [], containerId, isNewBucket)
  })

  if (Array.isArray(data.bookmarks) && data.bookmarks.length > 0) {
    var bookmarkTask = tasks.get(tasks.add({
      name: l('importBookmarksBucketName').replace('%s', data.sourceName || '')
    }))
    addBucketTabs(bookmarkTask, data.bookmarks, containerId, true)
  }

  syncBuckets()
}

function initialize () {
  ipc.on('import-tabs', function (e, data) {
    if (data && typeof data === 'object') {
      createImportedTabs(data)
    }
  })

  tasks.on('task-added', syncBuckets)
  tasks.on('task-destroyed', syncBuckets)
  tasks.on('task-updated', function (id, key) {
    if (key === 'name') {
      syncBuckets()
    }
  })
  syncBuckets()
}

module.exports = { initialize }
