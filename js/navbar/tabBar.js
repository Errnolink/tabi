const EventEmitter = require('events')
const dragula = require('dragula')
const webviews = require('webviews.js')
const readerView = require('readerView.js')
const tabAudio = require('tabAudio.js')
const settings = require('util/settings/settings.js')
const urlParser = require('util/urlParser.js')
const tabEditor = require('navbar/tabEditor.js')
const permissionRequests = require('navbar/permissionRequests.js')
const containers = require('containers.js')

function getContainerColor (containerId) {
  if (containers && typeof containers.get === 'function') {
    try {
      const c = containers.get(containerId)
      if (c && c.color) {
        return c.color
      }
    } catch (e) {}
  }
  return null
}

const collapsedBuckets = new Set()
let renamingTaskId = null

const tabBar = {
  navBar: document.getElementById('navbar'),
  container: document.getElementById('sidebar'),
  containerInner: document.getElementById('sidebar-buckets'),
  tabElementMap: {},
  events: new EventEmitter(),
  dragulaInstance: null,
  sidebarWidth: 260,
  isCollapsed: false,

  getTab: function (tabId) {
    return tabBar.tabElementMap[tabId]
  },
  getTabInput: function (tabId) {
    const tabEl = tabBar.getTab(tabId)
    return tabEl ? tabEl.querySelector('.tab-input') : null
  },
  setActiveTab: function (tabId) {
    const prevActive = document.querySelector('.tab-item.active')
    if (prevActive) {
      prevActive.classList.remove('active')
      prevActive.removeAttribute('aria-selected')
    }

    const el = tabBar.getTab(tabId)
    if (!el) {
      return
    }

    el.classList.add('active')
    el.setAttribute('aria-selected', 'true')

    // If tab is inside a collapsed bucket, uncollapse that bucket
    const bucketEl = el.closest('.sidebar-bucket')
    if (bucketEl && bucketEl.classList.contains('collapsed')) {
      const taskId = bucketEl.getAttribute('data-task')
      collapsedBuckets.delete(taskId)
      bucketEl.classList.remove('collapsed')
    }

    requestAnimationFrame(function () {
      if (el.scrollIntoViewIfNeeded) {
        el.scrollIntoViewIfNeeded()
      } else {
        el.scrollIntoView({ block: 'nearest' })
      }
    })
  },

  createTab: function (data, taskId) {
    const tabEl = document.createElement('div')
    tabEl.className = 'tab-item'
    tabEl.setAttribute('data-tab', data.id)
    tabEl.setAttribute('role', 'tab')

    const containerId = data.containerId || 'default'
    tabEl.setAttribute('data-container', containerId)

    // Container color stripe
    const stripe = document.createElement('span')
    stripe.className = 'tab-container-stripe'
    const color = getContainerColor(containerId)
    if (color) {
      stripe.style.backgroundColor = color
    }
    tabEl.appendChild(stripe)

    // Favicon
    const favicon = document.createElement('img')
    favicon.className = 'tab-favicon'
    if (data.favicon && data.favicon.url) {
      favicon.src = data.favicon.url
    } else {
      favicon.style.display = 'none'
    }
    favicon.addEventListener('error', function () {
      favicon.style.display = 'none'
    })
    tabEl.appendChild(favicon)

    // Reader button if available
    try {
      const readerBtn = readerView.getButton(data.id)
      if (readerBtn) {
        tabEl.appendChild(readerBtn)
      }
    } catch (e) {}

    // Audio / mute indicator
    try {
      const audioBtn = tabAudio.getButton(data.id)
      if (audioBtn) {
        tabEl.appendChild(audioBtn)
      }
    } catch (e) {}

    // Title
    const titleEl = document.createElement('span')
    titleEl.className = 'tab-title'
    tabEl.appendChild(titleEl)

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.className = 'tab-close-button i carbon:close'
    closeBtn.title = l('closeTab') || 'Close'
    closeBtn.setAttribute('tabindex', '-1')
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      tabBar.events.emit('tab-closed', data.id)
    })
    tabEl.appendChild(closeBtn)

    // Click to switch or focus omnibox
    tabEl.addEventListener('click', function () {
      if (tabs.getSelected() !== data.id) {
        if (taskId) {
          const browserUI = require('browserUI.js')
          browserUI.switchToTask(taskId)
        }
        tabBar.events.emit('tab-selected', data.id)
      } else {
        tabEditor.show(data.id)
      }
    })

    // Middle click to close tab
    tabEl.addEventListener('auxclick', function (e) {
      if (e.which === 2) {
        tabBar.events.emit('tab-closed', data.id)
      }
    })

    tabBar.tabElementMap[data.id] = tabEl
    tabBar.updateTab(data.id, tabEl)

    return tabEl
  },

  updateTab: function (tabId, tabEl = tabBar.getTab(tabId)) {
    if (!tabEl) {
      return
    }
    const tabData = tabs.get(tabId)
    if (!tabData) {
      return
    }

    let tabTitle
    const isNewTab = tabData.url === '' || tabData.url === urlParser.parse('min://newtab')
    if (isNewTab) {
      tabTitle = l('newTabLabel') || 'New Tab'
    } else if (tabData.title) {
      tabTitle = tabData.title
    } else if (tabData.loaded) {
      tabTitle = tabData.url
    }

    tabTitle = (tabTitle || l('newTabLabel') || 'New Tab').substring(0, 500)

    const titleEl = tabEl.querySelector('.tab-title')
    if (titleEl) {
      titleEl.textContent = tabTitle
    }
    tabEl.title = tabTitle

    // Favicon update
    const favicon = tabEl.querySelector('.tab-favicon')
    if (favicon) {
      if (tabData.favicon && tabData.favicon.url) {
        favicon.src = tabData.favicon.url
        favicon.style.display = ''
      } else {
        favicon.style.display = 'none'
      }
    }

    // Container stripe
    const containerId = tabData.containerId || 'default'
    tabEl.setAttribute('data-container', containerId)
    const stripe = tabEl.querySelector('.tab-container-stripe')
    if (stripe) {
      const color = getContainerColor(containerId)
      if (color) {
        stripe.style.backgroundColor = color
      } else {
        stripe.style.backgroundColor = 'transparent'
      }
    }

    // Audio button update
    const audioBtn = tabEl.querySelector('.tab-audio-button')
    if (audioBtn) {
      tabAudio.updateButton(tabId, audioBtn)
    }

    // Insecure / permission icons
    tabEl.querySelectorAll('.permission-request-icon').forEach(el => el.remove())
    try {
      permissionRequests.getButtons(tabId).reverse().forEach(function (button) {
        tabEl.insertBefore(button, tabEl.children[0])
      })
    } catch (e) {}
  },

  updateAll: function () {
    if (!tabBar.containerInner) {
      return
    }
    tabBar.containerInner.innerHTML = ''
    tabBar.tabElementMap = {}

    const selectedTask = tasks.getSelected()

    tasks.forEach(function (task, taskIndex) {
      const bucketEl = document.createElement('div')
      const isCurrentTask = selectedTask && task.id === selectedTask.id
      bucketEl.className = 'sidebar-bucket' + (isCurrentTask ? ' active-bucket' : '')
      if (collapsedBuckets.has(task.id)) {
        bucketEl.classList.add('collapsed')
      }
      bucketEl.setAttribute('data-task', task.id)

      // Bucket header
      const header = document.createElement('div')
      header.className = 'sidebar-bucket-header'

      const toggleBtn = document.createElement('button')
      toggleBtn.className = 'bucket-collapse-toggle i carbon:chevron-down'
      toggleBtn.setAttribute('tabindex', '-1')
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        if (collapsedBuckets.has(task.id)) {
          collapsedBuckets.delete(task.id)
          bucketEl.classList.remove('collapsed')
        } else {
          collapsedBuckets.add(task.id)
          bucketEl.classList.add('collapsed')
        }
      })
      header.appendChild(toggleBtn)

      const nameSpan = document.createElement('span')
      nameSpan.className = 'bucket-name'
      nameSpan.textContent = task.name || (l('defaultTaskName') ? l('defaultTaskName').replace('%n', taskIndex + 1) : `Bucket ${taskIndex + 1}`)
      header.appendChild(nameSpan)

      const countBadge = document.createElement('span')
      countBadge.className = 'bucket-count'
      countBadge.textContent = String(task.tabs.count())
      header.appendChild(countBadge)

      const addTabBtn = document.createElement('button')
      addTabBtn.className = 'bucket-add-tab i carbon:add'
      addTabBtn.title = l('newTabLabel') || 'New tab'
      addTabBtn.setAttribute('tabindex', '-1')
      addTabBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        const browserUI = require('browserUI.js')
        browserUI.switchToTask(task.id)
        browserUI.addTab()
      })
      header.appendChild(addTabBtn)

      // Header click switches to bucket
      header.addEventListener('click', function () {
        const browserUI = require('browserUI.js')
        browserUI.switchToTask(task.id)
      })

      // Double-click to rename bucket
      header.addEventListener('dblclick', function (e) {
        e.stopPropagation()
        if (renamingTaskId === task.id) {
          return
        }
        renamingTaskId = task.id
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'bucket-rename-input'
        input.value = task.name || nameSpan.textContent
        nameSpan.replaceWith(input)
        input.focus()
        input.select()

        function saveRename () {
          if (renamingTaskId !== task.id) {
            return
          }
          renamingTaskId = null
          const newName = input.value.trim()
          if (newName) {
            tasks.update(task.id, { name: newName })
          }
          tabBar.updateAll()
        }

        input.addEventListener('blur', saveRename)
        input.addEventListener('keydown', function (e2) {
          if (e2.key === 'Enter') {
            saveRename()
          } else if (e2.key === 'Escape') {
            renamingTaskId = null
            tabBar.updateAll()
          }
        })
      })

      bucketEl.appendChild(header)

      // Tab list for this bucket
      const tabsContainer = document.createElement('div')
      tabsContainer.className = 'sidebar-bucket-tabs'
      tabsContainer.setAttribute('data-task', task.id)

      task.tabs.get().forEach(function (tab) {
        const tabEl = tabBar.createTab(tab, task.id)
        tabsContainer.appendChild(tabEl)
      })

      bucketEl.appendChild(tabsContainer)
      tabBar.containerInner.appendChild(bucketEl)
    })

    if (tabs.getSelected()) {
      tabBar.setActiveTab(tabs.getSelected())
    }

    tabBar.initializeTabDragging()
  },

  addTab: function (tabId) {
    tabBar.updateAll()
  },

  removeTab: function (tabId) {
    const tabEl = tabBar.getTab(tabId)
    if (tabEl && tabEl.parentNode) {
      const bucketEl = tabEl.closest('.sidebar-bucket')
      tabEl.parentNode.removeChild(tabEl)
      delete tabBar.tabElementMap[tabId]
      if (bucketEl) {
        const countBadge = bucketEl.querySelector('.bucket-count')
        const taskId = bucketEl.getAttribute('data-task')
        const task = tasks.get(taskId)
        if (countBadge && task) {
          countBadge.textContent = String(task.tabs.count())
        }
      }
    } else {
      tabBar.updateAll()
    }
  },

  handleDividerPreference: function () {},
  handleSizeChange: function () {},

  initializeTabDragging: function () {
    if (tabBar.dragulaInstance) {
      tabBar.dragulaInstance.destroy()
    }

    const containers = Array.from(document.querySelectorAll('.sidebar-bucket-tabs'))
    if (containers.length === 0) {
      return
    }

    tabBar.dragulaInstance = dragula(containers, {
      direction: 'vertical',
      slideFactorY: 20
    })

    tabBar.dragulaInstance.on('drop', function (el, target, source, sibling) {
      if (!target || !source) {
        return
      }
      const tabId = el.getAttribute('data-tab')
      const sourceTaskId = source.getAttribute('data-task')
      const targetTaskId = target.getAttribute('data-task')

      const sourceTask = tasks.get(sourceTaskId)
      const targetTask = tasks.get(targetTaskId)
      if (!sourceTask || !targetTask) {
        return
      }

      const oldIdx = sourceTask.tabs.getIndex(tabId)
      if (oldIdx === -1) {
        return
      }

      const movedTab = sourceTask.tabs.splice(oldIdx, 1)[0]
      const adjacentTabId = sibling ? sibling.getAttribute('data-tab') : null
      let newIdx
      if (adjacentTabId) {
        newIdx = targetTask.tabs.getIndex(adjacentTabId)
      } else {
        newIdx = targetTask.tabs.count()
      }

      targetTask.tabs.splice(newIdx, 0, movedTab)

      const browserUI = require('browserUI.js')
      if (sourceTaskId !== targetTaskId) {
        browserUI.switchToTask(targetTaskId)
      }
      tabBar.updateAll()
    })
  },

  initializeResizer: function () {
    const resizer = document.getElementById('sidebar-resizer')
    if (!resizer) {
      return
    }

    let isResizing = false
    resizer.addEventListener('mousedown', function (e) {
      isResizing = true
      document.body.classList.add('is-resizing-sidebar')
      e.preventDefault()
    })

    window.addEventListener('mousemove', function (e) {
      if (!isResizing) {
        return
      }
      const minW = 180
      const maxW = 520
      const newWidth = Math.max(minW, Math.min(maxW, e.clientX))
      tabBar.sidebarWidth = newWidth
      document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px')
      if (tabBar.container) {
        tabBar.container.style.width = newWidth + 'px'
      }
    })

    window.addEventListener('mouseup', function () {
      if (isResizing) {
        isResizing = false
        document.body.classList.remove('is-resizing-sidebar')
        settings.set('sidebarWidth', tabBar.sidebarWidth)
        webviews.resize()
      }
    })
  },

  initializeCollapse: function () {
    const collapseBtn = document.getElementById('sidebar-collapse-button')
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        tabBar.isCollapsed = !tabBar.isCollapsed
        settings.set('sidebarCollapsed', tabBar.isCollapsed)
        tabBar.applyCollapseState()
      })
    }
  },

  applyCollapseState: function () {
    const collapseBtn = document.getElementById('sidebar-collapse-button')
    if (tabBar.isCollapsed) {
      if (tabBar.container) {
        tabBar.container.classList.add('sidebar-collapsed')
      }
      document.body.classList.add('sidebar-collapsed')
      if (collapseBtn) {
        collapseBtn.className = 'sidebar-action-button i carbon:chevron-right'
        collapseBtn.title = 'Expand sidebar'
      }
    } else {
      if (tabBar.container) {
        tabBar.container.classList.remove('sidebar-collapsed')
      }
      document.body.classList.remove('sidebar-collapsed')
      if (collapseBtn) {
        collapseBtn.className = 'sidebar-action-button i carbon:chevron-left'
        collapseBtn.title = 'Collapse sidebar'
      }
    }
    webviews.resize()
  },

  initialize: function () {
    // Persisted settings
    const savedWidth = settings.get('sidebarWidth')
    if (savedWidth && typeof savedWidth === 'number') {
      tabBar.sidebarWidth = savedWidth
      document.documentElement.style.setProperty('--sidebar-width', savedWidth + 'px')
      if (tabBar.container) {
        tabBar.container.style.width = savedWidth + 'px'
      }
    }

    const savedCollapsed = settings.get('sidebarCollapsed')
    if (savedCollapsed === true) {
      tabBar.isCollapsed = true
      tabBar.applyCollapseState()
    }

    tabBar.initializeResizer()
    tabBar.initializeCollapse()

    // New bucket button in header
    const newBucketBtn = document.getElementById('new-bucket-button')
    if (newBucketBtn) {
      newBucketBtn.addEventListener('click', function () {
        const browserUI = require('browserUI.js')
        browserUI.addTask()
      })
    }

    // Task and tab state events
    const stateEvents = ['task-added', 'task-removed', 'task-updated', 'tab-added', 'tab-removed', 'tab-updated']
    stateEvents.forEach(function (eventName) {
      tasks.on(eventName, function () {
        tabBar.updateAll()
      })
    })

    tasks.on('tab-selected', function (tabId) {
      tabBar.setActiveTab(tabId)
    })

    if (containers && typeof containers.on === 'function') {
      containers.on('changed', function () {
        tabBar.updateAll()
      })
    }
    tabBar.updateAll()
  }
}

tabBar.initialize()

module.exports = tabBar
