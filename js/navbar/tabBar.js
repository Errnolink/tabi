const webviews = require('webviews.js')
const containers = require('containers.js')
const shellLayout = require('shellLayout.js')
const tabHoverCard = require('navbar/tabHoverCard.js')
const permissionRequests = require('navbar/permissionRequests.js')
const state = require('navbar/tabBar/state.js')
const util = require('navbar/tabBar/util.js')

const tabBar = {
  container: document.getElementById('sidebar'),
  containerInner: document.getElementById('tabs-inner'),
  indicator: null,
  events: state.events,

  initializeResizer: function () {
    const resizer = document.getElementById('sidebar-resizer')
    if (!resizer) {
      return
    }
    let startX = 0
    let startWidth = 0
    let frame = null
    function onMove (e) {
      const width = startWidth + (e.clientX - startX)
      if (!frame) {
        frame = requestAnimationFrame(function () {
          frame = null
          shellLayout.setSidebarWidth(width, false)
        })
      }
    }
    function onUp () {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('is-resizing-sidebar')
      shellLayout.setSidebarWidth(shellLayout.sidebarWidth, true)
    }
    resizer.addEventListener('pointerdown', function (e) {
      if (shellLayout.collapsed) {
        return
      }
      startX = e.clientX
      startWidth = shellLayout.sidebarWidth
      document.body.classList.add('is-resizing-sidebar')
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      e.preventDefault()
    })
  },

  initialize: function () {
    util.motion.load()

    tabHoverCard.initialize()

    tabBar.container.addEventListener('mouseleave', function () {
      tabHoverCard.hide()
    })
    tabBar.containerInner.addEventListener('scroll', function () {
      tabHoverCard.hide()
    }, { passive: true })

    tabBar.indicator = document.createElement('div')
    tabBar.indicator.className = 'sidebar-indicator hidden'
    tabBar.containerInner.prepend(tabBar.indicator)
    tabBar.initializeResizer()

    document.getElementById('sidebar-collapse-button').addEventListener('click', function () {
      shellLayout.setCollapsed(!shellLayout.collapsed)
    })
    document.getElementById('new-bucket-button').addEventListener('click', function () {
      util.browserUI().addTask()
    })

    const structural = ['task-added', 'task-destroyed', 'tab-added', 'tab-destroyed', 'tab-splice']
    structural.forEach(name => tasks.on(name, tabBar.scheduleRender))
    tasks.on('task-updated', function (id, key) {
      if (key === 'collapsed') {
        tabBar.deferCollapsedRows(id)
        tabBar.render()
        const bucket = state.buckets.get(id)
        if (bucket) {
          bucket.body.addEventListener('transitionend', function settle (e) {
            if (e.target === bucket.body) {
              bucket.body.removeEventListener('transitionend', settle)
              tabBar.placeIndicator(true)
            }
          })
        }
        return
      }
      tabBar.scheduleRender()
    })
    tasks.on('tab-updated', function (id, key) {
      if (key === 'containerId' || key === 'title' || key === 'url' || key === 'favicon' || key === 'loaded' || key === 'hasAudio' || key === 'muted' || key === 'hasWebContents' || key === 'private' || key === 'pinned') {
        tabBar.updateTab(id)
      }
    })
    tasks.on('tab-selected', function () {
      tabBar.placeIndicator(!util.reduceMotion.matches)
    })
    webviews.bindEvent('did-start-loading', tabBar.updateTab)
    webviews.bindEvent('did-stop-loading', tabBar.updateTab)
    containers.on('changed', function () {
      state.rows.forEach((row, id) => tabBar.updateTab(id))
    })
    shellLayout.onChange(function () {
      requestAnimationFrame(() => tabBar.placeIndicator(false))
    })
    permissionRequests.onChange(function (tabId) {
      if (tabId && state.rows.has(tabId)) {
        tabBar.updateTab(tabId)
      } else {
        state.rows.forEach((row, id) => tabBar.updateTab(id))
      }
    })
    dnd.bindContainerDrops(tabBar.container)
  }
}

module.exports = tabBar

const rows = require('navbar/tabBar/rows.js')
const buckets = require('navbar/tabBar/buckets.js')
const dnd = require('navbar/tabBar/dnd.js')
const render = require('navbar/tabBar/render.js')

tabBar.getTab = rows.getTab
tabBar.createRow = rows.createRow
tabBar.updateTab = rows.updateTab
tabBar.createBucket = buckets.createBucket
tabBar.toggleBucket = buckets.toggleBucket
tabBar.startRename = buckets.startRename
tabBar.discardBucketRows = buckets.discardBucketRows
tabBar.deferCollapsedRows = buckets.deferCollapsedRows
tabBar.setActiveTab = buckets.setActiveTab
tabBar.commitDrop = dnd.commitDrop
tabBar.render = render.render
tabBar.scheduleRender = render.scheduleRender
tabBar.placeIndicator = render.placeIndicator
tabBar.removeTab = render.removeTab
tabBar.updateAll = render.updateAll
tabBar.addTab = render.addTab
tabBar.taskSwitched = render.taskSwitched

tabBar.initialize()

module.exports = tabBar
