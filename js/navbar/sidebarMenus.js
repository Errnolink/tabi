const remoteMenu = require('remoteMenuRenderer.js')
const browserUI = require('browserUI.js')
const readerView = require('readerView.js')
const urlParser = require('util/urlParser.js')
const containers = require('containers.js')
const tabActions = require('tabActions.js')

function bucketLabel (task, index) {
  return task.name || l('defaultTaskName').replace('%n', index + 1)
}

function createQuickContainer () {
  const existing = containers.list()
  const used = new Set(existing.map(c => c.color))
  const palette = containers.colors()
  const color = Object.values(palette).find(hex => !used.has(hex)) || Object.values(palette)[existing.length % Object.values(palette).length]
  const icons = containers.icons()
  let n = existing.length + 1
  while (existing.some(c => c.name === l('quickContainerName').replace('%n', n))) {
    n++
  }
  const name = l('quickContainerName').replace('%n', n)
  return containers.add({ name, color, icon: icons[existing.length % icons.length] })
}

function containerItems (current, onPick) {
  return containers.list().map(container => ({
    label: container.name,
    swatch: container.color,
    type: current !== undefined ? 'checkbox' : undefined,
    checked: current === container.id,
    click: () => onPick(container.id)
  })).concat([
    { type: 'separator' },
    { label: l('newContainerQuick'), icon: 'carbon:add', click: () => createQuickContainer().then(c => c && onPick(c.id)) },
    { label: l('manageContainers'), icon: 'carbon:settings', click: openContainerManager }
  ])
}

function openContainerManager () {
  browserUI.addTab(tabs.add({ url: 'min://app/pages/containers/index.html' }), { enterEditMode: false })
}

function tabMenu (tabId) {
  const task = tasks.getTaskContainingTab(tabId)
  const tab = task.tabs.get(tabId)
  const others = []
  tasks.forEach(function (other, index) {
    if (other.id !== task.id) {
      others.push({ label: bucketLabel(other, index), click: () => tabActions.moveToTask(tabId, other.id) })
    }
  })
  others.push({ type: 'separator' }, { label: l('newTask'), icon: 'carbon:folder-add', click: () => tabActions.moveToNewTask(tabId) })

  const sections = [
    [
      { label: l('tabMenuNewTabBelow'), icon: 'carbon:add', click: () => tabActions.newTabBelow(tabId) },
      { label: l('tabMenuReload'), icon: 'carbon:renew', accelerator: 'Ctrl+R', click: () => tabActions.reload(tabId) },
      { label: l('appMenuDuplicateTab'), icon: 'carbon:copy', accelerator: 'Ctrl+Shift+D', click: () => tabActions.duplicate(tabId) },
      { label: tab.pinned ? l('tabMenuUnpin') : l('tabMenuPin'), icon: tab.pinned ? 'carbon:pin-filled' : 'carbon:pin', click: () => tabActions.togglePin(tabId) },
      { label: tab.muted ? l('tabMenuUnmute') : l('tabMenuMute'), icon: tab.muted ? 'carbon:volume-up' : 'carbon:volume-mute', accelerator: 'Ctrl+Shift+M', click: () => tabActions.toggleMute(tabId) }
    ],
    [
      { label: l('tabMenuMoveToBucket'), icon: 'carbon:folder-move-to', submenu: others },
      {
        label: l('tabMenuOpenInContainer'),
        icon: 'carbon:layers',
        enabled: !tab.private,
        submenu: containerItems(containers.sanitizeContainerId(tab.containerId), function (containerId) {
          if (containerId !== containers.sanitizeContainerId(tab.containerId)) {
            containers.reopenTabInContainer(tabId, containerId)
          }
        })
      },
      { label: l('tabMenuCopyLink'), icon: 'carbon:link', enabled: !!tab.url, click: () => tabActions.copyLink(tabId) }
    ]
  ]

  if (tab.url && (readerView.isReader(tabId) || !urlParser.isInternalURL(tab.url))) {
    sections[1].push(readerView.isReader(tabId)
      ? { label: l('exitReaderView'), icon: 'carbon:document', click: () => readerView.exit(tabId) }
      : { label: l('enterReaderView'), icon: 'carbon:book', click: () => readerView.enter(tabId, tab.url) })
  }

  sections.push([
    { label: l('closeTab'), icon: 'carbon:close', accelerator: 'Ctrl+W', click: () => tabActions.close(tabId) },
    { label: l('tabMenuCloseOthers'), click: () => tabActions.closeOthers(tabId) },
    { label: l('tabMenuCloseBelow'), click: () => tabActions.closeBelow(tabId) }
  ])
  remoteMenu.open(sections)
}

function bucketMenu (taskId) {
  const task = tasks.get(taskId)
  const sidebar = require('navbar/tabBar.js')
  const shellLayout = require('shellLayout.js')
  const otherTasks = []
  tasks.forEach(function (other, index) {
    if (other.id !== taskId) {
      otherTasks.push({
        label: bucketLabel(other, index),
        swatch: `hsl(${shellLayout.bucketHue(index)} 70% 72%)`,
        click: () => tabActions.mergeTasks(taskId, other.id)
      })
    }
  })
  remoteMenu.open([
    [
      { label: l('newTabAction'), icon: 'carbon:add', click: () => tabActions.newTab(taskId) },
      { label: l('newTabInContainer'), icon: 'carbon:layers', submenu: containerItems(undefined, containerId => tabActions.newTab(taskId, containerId)) }
    ],
    [
      { label: l('bucketMenuRename'), icon: 'carbon:edit', click: () => sidebar.startRename(taskId) },
      {
        label: l('bucketMenuDefaultContainer'),
        icon: 'carbon:layers',
        submenu: containerItems(containers.sanitizeContainerId(task.defaultContainerId), containerId => containers.setBucketDefault(taskId, containerId))
      },
      { label: task.collapsed ? l('bucketMenuExpand') : l('bucketMenuCollapse'), icon: task.collapsed ? 'carbon:chevron-down' : 'carbon:chevron-up', click: () => sidebar.toggleBucket(taskId) },
      { label: l('bucketMenuReloadAll'), icon: 'carbon:renew', click: () => tabActions.reloadTask(taskId) },
      {
        label: l('bucketMenuMergeInto'),
        icon: 'carbon:folder-move-to',
        enabled: otherTasks.length > 0,
        submenu: otherTasks.length > 0 ? otherTasks : undefined
      }
    ],
    [
      { label: l('bucketMenuClose'), icon: 'carbon:trash-can', click: () => browserUI.closeTask(taskId) }
    ]
  ])
}

function sidebarMenu () {
  remoteMenu.open([
    [
      { label: l('newTabAction'), icon: 'carbon:add', accelerator: 'Ctrl+T', click: () => tabActions.newTab() },
      { label: l('newTabInContainer'), icon: 'carbon:layers', submenu: containerItems(undefined, containerId => tabActions.newTab(null, containerId)) },
      { label: l('newTask'), icon: 'carbon:folder-add', accelerator: 'Ctrl+N', click: () => browserUI.addTask() }
    ]
  ])
}

const sidebarMenus = {
  tabMenu,
  bucketMenu,
  initialize: function () {
    document.getElementById('sidebar').addEventListener('contextmenu', function (e) {
      e.preventDefault()
      e.stopPropagation()
      const row = e.target.closest('.tab-item')
      const head = e.target.closest('.bucket-head')
      if (row && !row.classList.contains('leaving')) {
        tabMenu(row.getAttribute('data-tab'))
      } else if (head) {
        bucketMenu(head.closest('.bucket').getAttribute('data-task'))
      } else {
        sidebarMenu()
      }
    })
  }
}

module.exports = sidebarMenus
