const { ipcRenderer } = require('electron')
const Sortable = require('sortablejs')

const webviews = require('webviews.js')
const keybindings = require('keybindings.js')
const browserUI = require('browserUI.js')
const tabBar = require('navbar/tabBar.js')
const tabEditor = require('navbar/tabEditor.js')
const focusMode = require('focusMode.js')
const modalMode = require('modalMode.js')
const overviewBuilder = require('overview/overviewBuilder.js')

let activeTransition = null

function canAnimate () {
  return typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const overview = {
  el: null,
  isShown: false,
  sortableInstances: [],
  activeFilter: 'all',
  searchQuery: '',
  controls: null,
  bucketsContainer: null,
  newBucketTarget: null,

  getDOM: function () {
    if (!this.el) {
      let el = document.getElementById('overview')
      if (!el) {
        el = document.createElement('div')
        el.id = 'overview'
        el.hidden = true
        el.tabIndex = -1
        document.body.appendChild(el)
      }
      this.el = el
    }
    return this.el
  },

  destroySortables: function () {
    this.sortableInstances.forEach(function (inst) {
      try {
        inst.destroy()
      } catch (e) {}
    })
    this.sortableInstances = []
  },

  setupSortable: function () {
    this.destroySortables()
    const self = this

    // Column drop lists for tabs
    const columns = this.el.querySelectorAll('.overview-column')
    columns.forEach(function (col) {
      const inst = new Sortable(col, {
        group: 'overview-tabs',
        draggable: '.overview-card',
        ghostClass: 'overview-card-ghost',
        chosenClass: 'overview-card-chosen',
        animation: 200,
        scroll: true,
        scrollSensitivity: 80,
        scrollSpeed: 15,
        onEnd: function (e) {
          self.handleTabDrop(e)
        }
      })
      self.sortableInstances.push(inst)
    })

    // New bucket drop target
    if (this.newBucketTarget) {
      const newBucketInst = new Sortable(this.newBucketTarget, {
        group: 'overview-tabs',
        draggable: '.overview-card',
        ghostClass: 'overview-card-ghost',
        onAdd: function (e) {
          self.handleTabDrop(e)
        }
      })
      self.sortableInstances.push(newBucketInst)
    }
  },

  handleTabDrop: function (e) {
    const item = e.item
    const tabId = item.getAttribute('data-tab')
    if (!tabId) {
      return
    }

    const previousTask = tasks.getTaskContainingTab(tabId)
    if (!previousTask) {
      return
    }

    const oldTab = previousTask.tabs.splice(previousTask.tabs.getIndex(tabId), 1)[0]
    if (!oldTab) {
      return
    }

    if (oldTab.selected) {
      const mostRecent = previousTask.tabs.get().sort(function (a, b) {
        return b.lastActivity - a.lastActivity
      })[0]
      if (mostRecent) {
        previousTask.tabs.setSelected(mostRecent.id)
      }
      oldTab.selected = false
    }

    let targetTask
    if (e.to === this.newBucketTarget || (this.newBucketTarget && this.newBucketTarget.contains(e.to))) {
      let index
      if (tasks.getSelected()) {
        index = tasks.getIndex(tasks.getSelected().id) + 1
      }
      const newTaskId = tasks.add({}, index)
      targetTask = tasks.get(newTaskId)
      if (item.parentNode) {
        item.remove()
      }
    } else {
      const targetBucketEl = e.to.closest('.overview-bucket-section')
      const targetBucketId = targetBucketEl ? targetBucketEl.getAttribute('data-bucket') : null
      targetTask = targetBucketId ? tasks.get(targetBucketId) : tasks.getSelected()
    }

    if (targetTask) {
      const newIdx = Array.from(e.to.children).indexOf(item)
      if (newIdx >= 0) {
        targetTask.tabs.splice(newIdx, 0, oldTab)
      } else {
        targetTask.tabs.add(oldTab, { atEnd: true })
      }
    }

    if (previousTask.tabs.count() === 0) {
      browserUI.closeTask(previousTask.id)
    }

    if (tabBar && tabBar.updateAll) {
      tabBar.updateAll()
    }

    this.render()
  },

  render: function () {
    const root = this.getDOM()
    this.destroySortables()
    root.innerHTML = ''

    const self = this

    // Top Controls
    this.controls = overviewBuilder.createTopControls({
      onSearch: function (val) {
        self.searchQuery = val.toLowerCase().trim()
        self.applyFilter()
      },
      onClear: function () {
        self.searchQuery = ''
        self.applyFilter()
      }
    })

    // Search input binding
    const searchInput = this.controls.input
    const clearBtn = this.controls.clearButton

    searchInput.value = this.searchQuery
    clearBtn.hidden = !this.searchQuery

    searchInput.addEventListener('input', function () {
      self.searchQuery = this.value.toLowerCase().trim()
      clearBtn.hidden = !self.searchQuery
      self.applyFilter()
    })

    clearBtn.addEventListener('click', function () {
      searchInput.value = ''
      self.searchQuery = ''
      clearBtn.hidden = true
      self.applyFilter()
      searchInput.focus()
    })

    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const firstVisible = self.el.querySelector('.overview-card:not([hidden])')
        if (firstVisible) {
          firstVisible.click()
        }
      }
    })

    // Filter Chips binding
    const chips = this.controls.filterBar.querySelectorAll('.overview-chip')
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('active') })
        this.classList.add('active')
        self.activeFilter = this.getAttribute('data-container') || 'all'
        self.applyFilter()
      })
    })

    root.appendChild(this.controls.element)

    // Buckets Container
    this.bucketsContainer = document.createElement('div')
    this.bucketsContainer.className = 'overview-buckets-container'

    const containerWidth = root.clientWidth || 960

    tasks.forEach(function (task, taskIdx) {
      const sectionObj = overviewBuilder.createBucketSection(task, taskIdx, {
        onBucketDelete: function (taskId, sectionEl) {
          if (tasks.count() <= 1) {
            return
          }
          sectionEl.remove()
          browserUI.closeTask(taskId)
          if (tabBar && tabBar.updateAll) {
            tabBar.updateAll()
          }
        }
      })

      const cards = []
      if (task.tabs) {
        task.tabs.forEach(function (tab) {
          const card = overviewBuilder.createCard(tab, task, {
            onTabSelect: function (tabId, taskId) {
              self.hide(tabId, taskId)
            },
            onTabClose: function (tabId, cardEl) {
              self.deleteTab(tabId, cardEl)
            }
          })
          cards.push(card)
        })
      }

      overviewBuilder.layoutMasonry(sectionObj.grid, cards, containerWidth)
      self.bucketsContainer.appendChild(sectionObj.element)
    })

    root.appendChild(this.bucketsContainer)

    // New Bucket Drop Target
    this.newBucketTarget = overviewBuilder.createNewBucketTarget(function () {
      browserUI.addTask()
      self.hide()
      if (tabEditor && tabs.getSelected()) {
        tabEditor.show(tabs.getSelected())
      }
    })
    root.appendChild(this.newBucketTarget)

    this.setupSortable()
    this.applyFilter()
    this.setupKeyboardNavigation()
  },

  deleteTab: function (tabId, cardEl) {
    const task = tasks.getTaskContainingTab(tabId)
    if (!task) {
      return
    }

    const successor = cardEl.nextElementSibling || cardEl.previousElementSibling
    const parentCol = cardEl.parentElement

    task.tabs.destroy(tabId)
    webviews.destroy(tabId)
    cardEl.remove()

    if (tabBar && tabBar.updateAll) {
      tabBar.updateAll()
    }

    if (task.tabs.count() === 0) {
      const section = this.el.querySelector(`.overview-bucket-section[data-bucket="${task.id}"]`)
      if (section) {
        section.remove()
      }
      browserUI.closeTask(task.id)
    } else {
      const section = this.el.querySelector(`.overview-bucket-section[data-bucket="${task.id}"]`)
      if (section) {
        const countBadge = section.querySelector('.overview-bucket-count')
        if (countBadge) {
          const count = task.tabs.count()
          countBadge.textContent = `${count} tab${count === 1 ? '' : 's'}`
        }
      }
    }

    if (successor) {
      successor.focus()
    } else if (parentCol) {
      const remaining = parentCol.querySelector('.overview-card')
      if (remaining) {
        remaining.focus()
      }
    }
  },

  applyFilter: function () {
    const query = this.searchQuery
    const containerFilter = this.activeFilter

    const sections = this.el.querySelectorAll('.overview-bucket-section')
    sections.forEach(function (section) {
      const bucketId = section.getAttribute('data-bucket')
      const task = tasks.get(bucketId)
      const taskName = (task && task.name ? task.name : '').toLowerCase()

      const cards = section.querySelectorAll('.overview-card')
      let visibleCardCount = 0

      cards.forEach(function (card) {
        const tabContainer = card.getAttribute('data-container') || 'default'
        if (containerFilter !== 'all' && tabContainer !== containerFilter) {
          card.hidden = true
          return
        }

        if (!query) {
          card.hidden = false
          visibleCardCount++
          return
        }

        const title = (card.querySelector('.overview-card-title') ? card.querySelector('.overview-card-title').textContent : '').toLowerCase()
        const domain = (card.querySelector('.overview-card-domain') ? card.querySelector('.overview-card-domain').textContent : '').toLowerCase()
        const text = `${title} ${domain} ${taskName} ${tabContainer}`

        const matches = query.split(' ').every(function (word) {
          return text.includes(word)
        })

        if (matches) {
          card.hidden = false
          visibleCardCount++
        } else {
          card.hidden = true
        }
      })

      if (visibleCardCount === 0 && (query || containerFilter !== 'all')) {
        section.hidden = true
      } else {
        section.hidden = false
      }
    })
  },

  setupKeyboardNavigation: function () {
    const root = this.el

    root.onkeydown = function (e) {
      const active = document.activeElement
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')

      if (e.key.toLowerCase() === 't' && !isInput) {
        const searchInput = root.querySelector('.overview-search-input')
        if (searchInput) {
          e.preventDefault()
          searchInput.focus()
          searchInput.select()
        }
        return
      }

      if (isInput) {
        if (e.key === 'Escape') {
          active.blur()
          const firstCard = root.querySelector('.overview-card:not([hidden])')
          if (firstCard) {
            firstCard.focus()
          }
        }
        return
      }

      const visibleCards = Array.from(root.querySelectorAll('.overview-card:not([hidden])'))
      const currentIndex = visibleCards.indexOf(active)

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentIndex >= 0 && currentIndex < visibleCards.length - 1) {
          visibleCards[currentIndex + 1].focus()
        } else if (visibleCards.length > 0) {
          visibleCards[0].focus()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentIndex > 0) {
          visibleCards[currentIndex - 1].focus()
        } else if (visibleCards.length > 0) {
          visibleCards[visibleCards.length - 1].focus()
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (currentIndex >= 0 && currentIndex + 3 < visibleCards.length) {
          visibleCards[currentIndex + 3].focus()
        } else if (currentIndex >= 0 && currentIndex < visibleCards.length - 1) {
          visibleCards[currentIndex + 1].focus()
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (currentIndex - 3 >= 0) {
          visibleCards[currentIndex - 3].focus()
        } else if (currentIndex > 0) {
          visibleCards[currentIndex - 1].focus()
        }
      } else if (e.key === 'Enter') {
        if (active && active.classList.contains('overview-card')) {
          e.preventDefault()
          active.click()
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (active && active.classList.contains('overview-card')) {
          e.preventDefault()
          const closeBtn = active.querySelector('.overview-card-close')
          if (closeBtn) {
            closeBtn.click()
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        overview.hide()
      }
    }
  },

  show: function () {
    if (this.isShown) {
      return
    }

    if (focusMode && focusMode.enabled && focusMode.enabled()) {
      focusMode.warn()
      return
    }

    if (modalMode && modalMode.enabled && modalMode.enabled()) {
      return
    }

    if (activeTransition) {
      try {
        activeTransition.skipTransition()
      } catch (e) {}
      activeTransition = null
    }

    // 1. Capture active view for thumbnail update
    webviews.captureCurrentTab({ forceCapture: true })

    // 2. Hide webviews and show pixel-identical placeholder
    webviews.requestPlaceholder('overview')

    if (tabEditor && tabEditor.hide) {
      tabEditor.hide()
    }

    document.body.classList.add('overview-is-shown')
    document.body.setAttribute('data-context', 'overview')
    this.isShown = true

    const btn = document.getElementById('overview-button') || document.getElementById('switch-task-button')
    if (btn) {
      btn.classList.add('active')
    }

    const self = this

    if (!canAnimate()) {
      self.render()
      self.getDOM().hidden = false
      const selectedCard = self.el.querySelector('.overview-card.is-selected') || self.el.querySelector('.overview-card')
      if (selectedCard) {
        selectedCard.focus()
      }
      return
    }

    try {
      activeTransition = document.startViewTransition(function () {
        self.render()
        self.getDOM().hidden = false
      })

      activeTransition.finished.finally(function () {
        activeTransition = null
        const selectedCard = self.el.querySelector('.overview-card.is-selected') || self.el.querySelector('.overview-card')
        if (selectedCard) {
          selectedCard.focus()
        }
      })
    } catch (err) {
      self.render()
      self.getDOM().hidden = false
      activeTransition = null
    }
  },

  hide: function (targetTabId, targetTaskId) {
    if (!this.isShown) {
      return
    }

    if (activeTransition) {
      try {
        activeTransition.skipTransition()
      } catch (e) {}
      activeTransition = null
    }

    this.isShown = false
    document.body.classList.remove('overview-is-shown')
    document.body.removeAttribute('data-context')

    const btn = document.getElementById('overview-button') || document.getElementById('switch-task-button')
    if (btn) {
      btn.classList.remove('active')
    }

    const self = this

    function activateTarget () {
      if (targetTaskId) {
        browserUI.switchToTask(targetTaskId)
      }
      if (targetTabId) {
        browserUI.switchToTab(targetTabId)
      } else if (!tabs.getSelected()) {
        const mostRecentTab = tabs.get().sort(function (a, b) {
          return b.lastActivity - a.lastActivity
        })[0]
        if (mostRecentTab) {
          browserUI.switchToTab(mostRecentTab.id)
        }
      } else {
        browserUI.switchToTab(tabs.getSelected())
      }
      webviews.hidePlaceholder('overview')
    }

    if (!canAnimate()) {
      self.getDOM().hidden = true
      self.destroySortables()
      activateTarget()
      return
    }

    try {
      activeTransition = document.startViewTransition(function () {
        self.getDOM().hidden = true
      })

      activeTransition.finished.finally(function () {
        activeTransition = null
        self.destroySortables()
        activateTarget()
      })
    } catch (err) {
      self.getDOM().hidden = true
      self.destroySortables()
      activateTarget()
      activeTransition = null
    }
  },

  toggle: function () {
    if (this.isShown) {
      this.hide()
    } else {
      this.show()
    }
  },

  initialize: function () {
    const self = this

    // Bind wheel on navbar to swipe down
    const navbar = document.getElementById('navbar')
    if (navbar) {
      navbar.addEventListener('wheel', function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
          return
        }
        if (e.deltaY < -30 && Math.abs(e.deltaX) < 10) {
          self.show()
          e.stopImmediatePropagation()
        }
      })
    }

    // Bind shortcuts
    keybindings.defineShortcut('toggleTasks', function () {
      self.toggle()
    })

    keybindings.defineShortcut({ keys: 'mod+shift+o' }, function () {
      self.toggle()
    })

    keybindings.defineShortcut({ keys: 'ctrl+shift+o' }, function () {
      self.toggle()
    })

    keybindings.defineShortcut({ keys: 'esc' }, function () {
      if (self.isShown) {
        self.hide()
      }
    })

    keybindings.defineShortcut('enterEditMode', function () {
      if (self.isShown) {
        self.hide()
      }
    })

    keybindings.defineShortcut('closeTab', function () {
      if (!self.isShown) {
        return
      }
      const active = document.activeElement
      if (active && active.classList.contains('overview-card')) {
        const tabId = active.getAttribute('data-tab')
        if (tabId) {
          self.deleteTab(tabId, active)
        }
      }
    }, { contexts: ['overview'] })

    function addTaskFromMenu () {
      if (modalMode && modalMode.enabled && modalMode.enabled()) {
        return
      }
      if (focusMode && focusMode.enabled && focusMode.enabled()) {
        focusMode.warn()
        return
      }
      browserUI.addTask()
      self.show()
    }

    keybindings.defineShortcut('addTask', addTaskFromMenu)
    ipcRenderer.on('addTask', addTaskFromMenu)

    // Bind buttons
    const bindBtn = function () {
      const overviewButton = document.getElementById('overview-button') || document.getElementById('switch-task-button')
      if (overviewButton && !overviewButton.hasAttribute('data-overview-bound')) {
        overviewButton.setAttribute('data-overview-bound', 'true')
        overviewButton.title = typeof l === 'function' ? l('viewTasks') : 'Overview'
        overviewButton.addEventListener('click', function () {
          self.toggle()
        })
      }
    }
    bindBtn()
    setTimeout(bindBtn, 1000)

    // Listen for state changes
    tasks.on('state-sync-change', function () {
      if (self.isShown) {
        self.render()
      }
    })
  }
}

module.exports = overview
