const containers = require('containers.js')
const state = require('navbar/tabBar/state.js')
const util = require('navbar/tabBar/util.js')
const dnd = require('navbar/tabBar/dnd.js')
const tabBar = require('navbar/tabBar.js')

const buckets = state.buckets

function createBucket (taskId) {
  const el = document.createElement('section')
  el.className = 'bucket'
  el.setAttribute('data-task', taskId)

  const head = document.createElement('div')
  head.className = 'bucket-head'
  head.title = l('bucketTooltip')

  const chevron = document.createElement('button')
  chevron.className = 'bucket-chevron i carbon:chevron-down'
  chevron.title = l('bucketTooltipCollapse')
  chevron.tabIndex = -1
  const dot = document.createElement('span')
  dot.className = 'bucket-dot'

  const name = document.createElement('span')
  name.className = 'bucket-name'

  const count = document.createElement('span')
  count.className = 'bucket-count'

  const add = document.createElement('button')
  add.className = 'bucket-add i carbon:add'
  add.tabIndex = -1
  add.title = util.withShortcut(l('newTabInGroup'), 'addTab')

  head.append(chevron, dot, name, count, add)

  const body = document.createElement('div')
  body.className = 'bucket-body'
  const list = document.createElement('div')
  list.className = 'bucket-list'
  list.setAttribute('data-task', taskId)
  body.appendChild(list)

  el.append(head, body)

  chevron.addEventListener('click', function (e) {
    e.stopPropagation()
    tabBar.toggleBucket(taskId)
  })

  head.addEventListener('click', function () {
    if (state.flags.renamingTaskId === taskId) {
      return
    }
    if (!tasks.get(taskId)) {
      return
    }
    if (tasks.getSelected().id !== taskId) {
      util.browserUI().switchToTask(taskId)
    } else {
      tabBar.toggleBucket(taskId)
    }
  })

  head.addEventListener('dblclick', function (e) {
    e.stopPropagation()
    tabBar.startRename(taskId)
  })

  add.addEventListener('click', function (e) {
    e.stopPropagation()
    const task = tasks.get(taskId)
    if (!task) {
      return
    }
    if (tasks.getSelected().id !== taskId) {
      util.browserUI().switchToTask(taskId)
    }
    const newTab = tabs.add({ containerId: containers.containerForNewTab(taskId) })
    util.browserUI().addTab(newTab)
  })

  const sortable = dnd.attachSortable(list)
  const bucket = { el, head, chevron, dot, name, count, add, body, list, sortable }
  buckets.set(taskId, bucket)
  return bucket
}

function toggleBucket (taskId, collapsed) {
  const task = tasks.get(taskId)
  if (!task) {
    return
  }
  const next = typeof collapsed === 'boolean' ? collapsed : !task.collapsed
  tasks.update(taskId, { collapsed: next })
}

function startRename (taskId) {
  const bucket = buckets.get(taskId)
  const task = tasks.get(taskId)
  if (!bucket || !task || state.flags.renamingTaskId) {
    return
  }
  state.flags.renamingTaskId = taskId
  const input = document.createElement('input')
  input.className = 'bucket-rename'
  input.value = task.name || bucket.name.textContent
  input.spellcheck = false
  bucket.name.replaceWith(input)
  input.focus()
  input.select()

  let done = false
  function finish (commit) {
    if (done) {
      return
    }
    done = true
    const value = input.value.trim()
    input.replaceWith(bucket.name)
    state.flags.renamingTaskId = null
    if (commit && value && tasks.get(taskId)) {
      tasks.update(taskId, { name: value })
    }
    tabBar.render()
  }
  input.addEventListener('keydown', function (e) {
    e.stopPropagation()
    if (e.key === 'Enter') {
      finish(true)
    } else if (e.key === 'Escape') {
      finish(false)
    }
  })
  input.addEventListener('blur', function () { finish(true) })
  input.addEventListener('click', e => e.stopPropagation())
}

function discardBucketRows (taskId) {
  const bucket = buckets.get(taskId)
  if (!bucket) {
    return
  }
  bucket.rowsFoldable = false
  bucket.rowTeardown = null
  state.rows.forEach(function (row, id) {
    if (state.leaving.has(id)) {
      return
    }
    if (row.el.closest('.bucket') === bucket.el) {
      row.el.remove()
      state.rows.delete(id)
    }
  })
}

function deferCollapsedRows (taskId) {
  const bucket = buckets.get(taskId)
  if (!bucket) {
    return
  }
  if (bucket.rowTeardown) {
    clearTimeout(bucket.rowTeardown)
    bucket.rowTeardown = null
  }
  const task = tasks.get(taskId)
  if (task && task.collapsed && !util.reduceMotion.matches) {
    bucket.rowsFoldable = true
    bucket.rowTeardown = setTimeout(function () {
      tabBar.discardBucketRows(taskId)
    }, 450)
  } else {
    bucket.rowsFoldable = false
  }
}

function setActiveTab (tabId) {
  const found = util.findTab(tabId)
  if (found && found.task.collapsed) {
    tasks.update(found.task.id, { collapsed: false })
    return
  }
  tabBar.placeIndicator(!util.reduceMotion.matches)
}

module.exports = { createBucket, toggleBucket, startRename, discardBucketRows, deferCollapsedRows, setActiveTab }
