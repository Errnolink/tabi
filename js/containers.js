/*
Renderer-side container API. The registry is persisted by the main process
(userData/containers.json); the list is loaded synchronously so that tab views
are always created with the right partition.
*/

/* global ipc */

/* Firefox's container vocabulary (10 colors, 13 icons), mapped to Min's carbon icon font */
const CONTAINER_COLORS = {
  blue: '#37adff',
  cyan: '#00c79a',
  green: '#51cd00',
  yellow: '#ffcb00',
  orange: '#ff9f00',
  red: '#ff613d',
  pink: '#ff4bda',
  purple: '#af51f5',
  violet: '#764edd',
  gray: '#7c7c7d'
}

const CONTAINER_ICONS = ['fingerprint', 'briefcase', 'dollar', 'cart', 'vacation', 'gift', 'food', 'fruit', 'pet', 'tree', 'chill', 'circle', 'fence']

const CONTAINER_CARBON_ICONS = {
  fingerprint: 'carbon:fingerprint-recognition',
  briefcase: 'carbon:enterprise',
  dollar: 'carbon:currency-dollar',
  cart: 'carbon:shopping-cart',
  vacation: 'carbon:plane',
  gift: 'carbon:gift',
  food: 'carbon:restaurant',
  fruit: 'carbon:fruit-bowl',
  pet: 'carbon:dog-walker',
  tree: 'carbon:tree',
  chill: 'carbon:face-cool',
  circle: 'carbon:circle-dash',
  fence: 'carbon:border-full'
}

/* the main process sends { containers, defaultId }; tolerate a plain array so a
   stale main bundle can never leave the UI without a container list */
function normalizeRegistryState (state) {
  if (Array.isArray(state)) {
    return { containers: state, defaultId: 'default' }
  }
  return {
    containers: (state && state.containers) || [],
    defaultId: (state && state.defaultId) || 'default'
  }
}

var bootState = normalizeRegistryState(ipc.sendSync('containers:list-sync'))
var currentList = bootState.containers
var currentDefaultId = bootState.defaultId
var changeListeners = []
var tabCountTimeout = null

function emitChanged () {
  changeListeners.forEach(function (fn) {
    fn()
  })
}

function list () {
  return currentList
}

function defaultId () {
  return currentDefaultId
}

function defaultContainer () {
  return currentList.find(c => c.id === currentDefaultId) || currentList[0] || null
}

function isDefault (id) {
  return sanitizeContainerId(id) === currentDefaultId
}

function get (id) {
  return currentList.find(c => c.id === id) || defaultContainer()
}

function partitionFor (id) {
  var container = get(id)
  return container ? container.partition : 'persist:webcontent'
}

/* returns the id if the container still exists, the current default's id otherwise.
   The literal 'default' keeps meaning the container with id 'default' while it exists */
function sanitizeContainerId (id) {
  if (currentList.some(c => c.id === id)) {
    return id
  }
  return defaultContainer() ? defaultContainer().id : 'default'
}

function add (data) {
  return ipc.invoke('containers:add', data).then(function (container) {
    if (!currentList.some(c => c.id === container.id)) {
      currentList = currentList.concat([container])
    }
    return container
  })
}

function update (id, data) {
  return ipc.invoke('containers:update', id, data).then(function () {
    return currentList
  })
}

function remove (id, newDefaultId) {
  // re-homing happens in the containers-changed listener so that every
  // window re-homes its tabs, not just the one that requested the removal
  return ipc.invoke('containers:remove', id, newDefaultId)
}

/* moves tabs referencing containers that no longer exist to Default and
   recreates their views, since a view can never switch sessions */
function rehomeTabsOfRemovedContainers () {
  var browserUI = require('browserUI.js')
  var webviews = require('webviews.js')

  var affectedTabIds = []
  tasks.forEach(function (task) {
    task.tabs.forEach(function (tab) {
      if (tab.containerId && !currentList.some(c => c.id === tab.containerId)) {
        affectedTabIds.push(tab.id)
      }
    })
  })

  if (affectedTabIds.length === 0) {
    return
  }

  affectedTabIds.forEach(function (tabId) {
    tasks.getTaskContainingTab(tabId).tabs.update(tabId, {
      containerId: defaultId()
    })
  })

  var selectedTabId = tabs.getSelected()
  affectedTabIds.forEach(function (tabId) {
    if (webviews.hasViewForTab(tabId)) {
      webviews.destroy(tabId)
    }
  })
  if (affectedTabIds.includes(selectedTabId)) {
    browserUI.switchToTab(selectedTabId)
  }
}

function on (event, fn) {
  if (event === 'changed') {
    changeListeners.push(fn)
  }
}

/* the carbon icon class for a container icon name, for sidebar stripes and overview cards */
function carbonIcon (name) {
  return CONTAINER_CARBON_ICONS[name] || 'carbon:circle-dash'
}

function colors () {
  return Object.assign({}, CONTAINER_COLORS)
}

function icons () {
  return CONTAINER_ICONS.slice()
}

/* the container a plain new tab in the given bucket should open in */
function containerForNewTab (taskId) {
  var task = tasks.get(taskId)
  if (task && task.defaultContainerId && currentList.some(c => c.id === task.defaultContainerId)) {
    return task.defaultContainerId
  }
  return defaultId()
}

/* reloads every tab of the container that has a live view, after its data was cleared */
function reloadTabsOfContainer (containerId) {
  var webviews = require('webviews.js')

  tasks.forEach(function (task) {
    task.tabs.forEach(function (tab) {
      if (sanitizeContainerId(tab.containerId) === containerId && webviews.hasViewForTab(tab.id)) {
        webviews.callAsync(tab.id, 'reload')
      }
    })
  })
}

/* creates a new tab with the same URL in the target container and closes the old one */
function reopenTabInContainer (tabId, containerId) {
  var browserUI = require('browserUI.js')

  var containingTask = tasks.getTaskContainingTab(tabId)
  if (!containingTask) {
    return
  }
  var tab = containingTask.tabs.get(tabId)
  if (!tab || tab.private) {
    return
  }

  if (tasks.getSelected().id !== containingTask.id) {
    browserUI.switchToTask(containingTask.id)
  }
  var wasSelected = tabs.getSelected() === tabId
  var newTabId = tabs.add({
    url: tab.url,
    title: tab.title,
    containerId: sanitizeContainerId(containerId)
  })
  browserUI.addTab(newTabId, {
    enterEditMode: false,
    openInBackground: !wasSelected
  })
  browserUI.closeTab(tabId)
}

function setBucketDefault (taskId, containerId) {
  tasks.update(taskId, {
    defaultContainerId: sanitizeContainerId(containerId)
  })
}
function promptCreate (anchor, onCreated) {
  var glassMenu = require('glassMenu.js')
  var existing = list()
  var usedColors = new Set(existing.map(function (c) { return c.color }))
  var palette = Object.values(colors())
  var defaultColor = palette.find(function (hex) { return !usedColors.has(hex) }) || palette[existing.length % palette.length]
  var n = existing.length + 1
  while (existing.some(function (c) { return c.name === (l('quickContainerName') || 'Account %n').replace('%n', n) })) {
    n++
  }
  var prefilledName = (l('quickContainerName') || 'Account %n').replace('%n', n)
  var selectedColor = defaultColor

  var panel = document.createElement('div')
  panel.className = 'container-prompt-panel'

  var head = document.createElement('div')
  head.className = 'container-prompt-head'
  var dot = document.createElement('span')
  dot.className = 'container-prompt-dot'
  dot.style.backgroundColor = selectedColor
  var title = document.createElement('span')
  title.className = 'container-prompt-title'
  title.textContent = l('containersNewContainer') || 'New Container'
  head.append(dot, title)

  var desc = document.createElement('div')
  desc.className = 'container-prompt-desc'
  desc.textContent = l('containersExplanationShort') || 'Separate cookies and logins, so you can be signed in to several accounts at once.'

  var nameRow = document.createElement('div')
  nameRow.className = 'container-prompt-row'
  var nameLabel = document.createElement('label')
  nameLabel.className = 'container-prompt-label'
  nameLabel.textContent = l('containersNameLabel') || 'Name'
  var nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.className = 'container-prompt-input'
  nameInput.value = prefilledName
  nameInput.maxLength = 64
  nameInput.spellcheck = false
  nameRow.append(nameLabel, nameInput)

  var colorRow = document.createElement('div')
  colorRow.className = 'container-prompt-row'
  var colorLabel = document.createElement('label')
  colorLabel.className = 'container-prompt-label'
  colorLabel.textContent = l('containersColorLabel') || 'Color'
  var swatches = document.createElement('div')
  swatches.className = 'container-prompt-swatches'

  palette.forEach(function (hex) {
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'container-prompt-swatch' + (hex === selectedColor ? ' selected' : '')
    btn.style.backgroundColor = hex
    btn.addEventListener('click', function (e) {
      e.stopPropagation()
      selectedColor = hex
      dot.style.backgroundColor = hex
      swatches.querySelectorAll('.container-prompt-swatch').forEach(function (s) { s.classList.remove('selected') })
      btn.classList.add('selected')
    })
    swatches.appendChild(btn)
  })
  colorRow.append(colorLabel, swatches)

  var actions = document.createElement('div')
  actions.className = 'container-prompt-actions'
  var cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'container-prompt-btn btn-cancel'
  cancelBtn.textContent = l('containersCancel') || 'Cancel'
  cancelBtn.addEventListener('click', function () {
    glassMenu.close()
  })

  var createBtn = document.createElement('button')
  createBtn.type = 'button'
  createBtn.className = 'container-prompt-btn btn-create'
  createBtn.textContent = l('containersCreate') || 'Create'

  function submit () {
    var finalName = nameInput.value.trim() || prefilledName
    add({ name: finalName, color: selectedColor, icon: 'circle' }).then(function (created) {
      glassMenu.close()
      if (typeof onCreated === 'function' && created) {
        onCreated(created)
      }
    }).catch(function (err) {
      console.warn('failed to add container', err)
      glassMenu.close()
    })
  }

  createBtn.addEventListener('click', submit)

  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      submit()
    }
  })

  actions.append(cancelBtn, createBtn)
  panel.append(head, desc, nameRow, colorRow, actions)

  var options = {}
  if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
    options.x = Math.max(16, Math.min(window.innerWidth - 320, anchor.x))
    options.y = Math.max(16, Math.min(window.innerHeight - 260, anchor.y))
  } else {
    options.x = Math.round(window.innerWidth / 2 - 150)
    options.y = Math.round(window.innerHeight / 3)
  }

  glassMenu.openPanel(panel, options)
  requestAnimationFrame(function () {
    nameInput.focus()
    nameInput.select()
  })
}

/* keep the main process' open-tab counts (shown in the container manager) up to date.
   Only the focused window reports, since every window has all tasks synced in memory */
function sendTabCounts () {
  if (tabCountTimeout) {
    return
  }
  tabCountTimeout = setTimeout(function () {
    tabCountTimeout = null
    if (!document.body.classList.contains('focused')) {
      return
    }
    var counts = {}
    tasks.forEach(function (task) {
      task.tabs.forEach(function (tab) {
        var id = sanitizeContainerId(tab.containerId)
        counts[id] = (counts[id] || 0) + 1
      })
    })
    ipc.send('containers:tabCounts', counts)
  }, 100)
}

ipc.on('containers-changed', function (e, state) {
  var normalized = normalizeRegistryState(state)
  currentList = normalized.containers
  currentDefaultId = normalized.defaultId
  rehomeTabsOfRemovedContainers()
  emitChanged()
})

ipc.on('containers-cleared', function (e, containerId) {
  reloadTabsOfContainer(containerId)
})

tasks.on('*', sendTabCounts)
window.addEventListener('focus', sendTabCounts)
sendTabCounts()

module.exports = {
  list,
  get,
  partitionFor,
  sanitizeContainerId,
  defaultId,
  isDefault,
  add,
  update,
  remove,
  on,
  carbonIcon,
  colors,
  icons,
  containerForNewTab,
  reopenTabInContainer,
  setBucketDefault,
  promptCreate
}
