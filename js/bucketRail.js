var browserUI = require('browserUI.js')

var RAIL_WIDTH = 240
var HOVER_DELAY = 400

var renamingTaskId = null
var hoverTimer = null
var previewCard = null

function bucketName (task, index) {
  return task.name || l('defaultTaskName').replace('%n', index + 1)
}

function hidePreview () {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  if (previewCard && previewCard.parentNode) {
    previewCard.parentNode.removeChild(previewCard)
  }
  previewCard = null
}

function showPreview (row, tab) {
  hidePreview()
  var rail = document.getElementById('bucket-rail')
  if (!rail) {
    return
  }
  previewCard = document.createElement('div')
  previewCard.className = 'rail-preview-card theme-background-color theme-text-color'
  if (tab.previewImage) {
    var img = document.createElement('img')
    img.className = 'rail-preview-thumb'
    img.src = tab.previewImage
    previewCard.appendChild(img)
  }
  var title = document.createElement('div')
  title.className = 'rail-preview-title'
  title.textContent = tab.title || tab.url || 'New tab'
  previewCard.appendChild(title)
  if (tab.url) {
    var url = document.createElement('div')
    url.className = 'rail-preview-url'
    url.textContent = tab.url
    previewCard.appendChild(url)
  }
  rail.appendChild(previewCard)
  var top = row.offsetTop + row.offsetHeight + 2
  var maxTop = rail.scrollTop + rail.clientHeight - previewCard.offsetHeight - 4
  previewCard.style.top = Math.max(rail.scrollTop + 4, Math.min(top, maxTop)) + 'px'
}

function finishRename (id, value) {
  renamingTaskId = null
  tasks.update(id, { name: value })
  render()
}

function startRename (task, head) {
  renamingTaskId = task.id
  hidePreview()
  head.innerHTML = ''
  var input = document.createElement('input')
  input.className = 'rail-rename-input'
  input.placeholder = l('nameTask')
  input.value = task.name || ''
  input.addEventListener('keydown', function (e) {
    e.stopPropagation()
    if (e.key === 'Enter') {
      finishRename(task.id, input.value)
    } else if (e.key === 'Escape') {
      renamingTaskId = null
      render()
    }
  })
  input.addEventListener('blur', function () {
    if (renamingTaskId === task.id) {
      finishRename(task.id, input.value)
    }
  })
  head.appendChild(input)
  input.focus()
  input.select()
}

function render () {
  var rail = document.getElementById('bucket-rail')
  if (!rail || renamingTaskId) {
    return
  }
  hidePreview()
  rail.innerHTML = ''
  var selected = tasks.getSelected()
  tasks.forEach(function (task, index) {
    var group = document.createElement('div')
    group.className = 'rail-bucket' + (selected && task.id === selected.id ? ' active' : '')

    var head = document.createElement('div')
    head.className = 'rail-bucket-head'

    var nameSpan = document.createElement('span')
    nameSpan.className = 'rail-bucket-name'
    nameSpan.textContent = bucketName(task, index)
    head.appendChild(nameSpan)

    var countSpan = document.createElement('span')
    countSpan.className = 'rail-bucket-count'
    countSpan.textContent = String(task.tabs.get().length)
    head.appendChild(countSpan)

    head.addEventListener('click', function () {
      browserUI.switchToTask(task.id)
    })
    head.addEventListener('dblclick', function () {
      if (renamingTaskId !== task.id) {
        startRename(task, head)
      }
    })
    group.appendChild(head)

    task.tabs.get().forEach(function (tab) {
      var row = document.createElement('div')
      var isActive = selected && task.id === selected.id && tab.id === selected.tabs.getSelected()
      row.className = 'rail-tab' + (isActive ? ' active-tab' : '')

      if (tab.favicon && tab.favicon.url) {
        var favicon = document.createElement('img')
        favicon.className = 'rail-tab-favicon'
        favicon.src = tab.favicon.url
        favicon.addEventListener('error', function () {
          favicon.hidden = true
        })
        row.appendChild(favicon)
      }

      var titleSpan = document.createElement('span')
      titleSpan.className = 'rail-tab-title'
      titleSpan.textContent = tab.title || tab.url || 'New tab'
      row.appendChild(titleSpan)

      var closeButton = document.createElement('span')
      closeButton.className = 'rail-tab-close'
      closeButton.textContent = '×'
      closeButton.addEventListener('click', function (e) {
        e.stopPropagation()
        hidePreview()
        browserUI.closeTab(tab.id)
      })
      row.appendChild(closeButton)

      row.addEventListener('click', function () {
        hidePreview()
        browserUI.switchToTask(task.id)
        browserUI.switchToTab(tab.id)
      })
      row.addEventListener('mouseenter', function () {
        clearTimeout(hoverTimer)
        hoverTimer = setTimeout(function () {
          hoverTimer = null
          showPreview(row, tab)
        }, HOVER_DELAY)
      })
      row.addEventListener('mouseleave', hidePreview)
      group.appendChild(row)
    })

    rail.appendChild(group)
  })
}

function initialize () {
  document.body.classList.add('rail-on')
  var events = ['task-added', 'task-removed', 'task-updated', 'tab-added', 'tab-removed', 'tab-updated', 'tab-selected']
  events.forEach(function (name) {
    tasks.on(name, function () {
      render()
    })
  })
  render()
}

module.exports = { initialize, RAIL_WIDTH }
