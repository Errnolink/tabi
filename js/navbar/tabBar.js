const EventEmitter = require('events')
const Sortable = require('sortablejs')
const webviews = require('webviews.js')
const urlParser = require('util/urlParser.js')
const tabEditor = require('navbar/tabEditor.js')
const permissionRequests = require('navbar/permissionRequests.js')
const containers = require('containers.js')
const shellLayout = require('shellLayout.js')
const tabHoverCard = require('navbar/tabHoverCard.js')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function cssVar (name) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const motion = {
  spatial: null,
  spatialFast: null,
  effects: null,
  load: function () {
    motion.spatial = cssVar('--spring-spatial') || 'cubic-bezier(.2,.9,.3,1)'
    motion.spatialFast = cssVar('--spring-spatial-fast') || motion.spatial
    motion.effects = cssVar('--spring-effects') || 'ease-out'
  }
}

function browserUI () {
  return require('browserUI.js')
}

function findTab (tabId) {
  const task = tasks.getTaskContainingTab(tabId)
  return task ? { task, tab: task.tabs.get(tabId) } : null
}

function isNewTabUrl (url) {
  return !url || url === urlParser.parse('min://newtab')
}

function tabTitle (tab) {
  if (isNewTabUrl(tab.url)) {
    return l('newTabLabel') || 'New Tab'
  }
  return (tab.title || (tab.loaded ? tab.url : '') || l('newTabLabel') || 'New Tab').substring(0, 300)
}

function bucketName (task, index) {
  return task.name || (l('defaultTaskName') || 'Bucket %n').replace('%n', index + 1)
}

const rows = new Map()
const buckets = new Map()
const leaving = new Set()
let renamingTaskId = null
let dragging = false
let renderQueued = false
let indicatorPlaced = false

const tabBar = {
  container: document.getElementById('sidebar'),
  containerInner: document.getElementById('tabs-inner'),
  indicator: null,
  events: new EventEmitter(),

  getTab: function (tabId) {
    const row = rows.get(tabId)
    return row ? row.el : undefined
  },

  createRow: function (tabId) {
    const el = document.createElement('div')
    el.className = 'tab-item'
    el.setAttribute('role', 'tab')
    el.setAttribute('data-tab', tabId)

    const stripe = document.createElement('span')
    stripe.className = 'tab-stripe'

    const icon = document.createElement('span')
    icon.className = 'tab-icon'
    const favicon = document.createElement('img')
    favicon.className = 'tab-favicon'
    favicon.decoding = 'async'
    favicon.addEventListener('error', function () {
      icon.classList.add('no-favicon')
    })
    favicon.addEventListener('load', function () {
      icon.classList.remove('no-favicon')
    })
    const glyph = document.createElement('span')
    glyph.className = 'tab-glyph'
    icon.appendChild(favicon)
    icon.appendChild(glyph)

    const permissions = document.createElement('span')
    permissions.className = 'tab-permissions'

    const title = document.createElement('span')
    title.className = 'tab-title'

    const audio = document.createElement('button')
    audio.className = 'tab-audio i'
    audio.tabIndex = -1
    audio.addEventListener('click', function (e) {
      e.stopPropagation()
      const found = findTab(tabId)
      if (found && (found.tab.hasAudio || found.tab.muted)) {
        webviews.callAsync(tabId, 'setAudioMuted', !found.tab.muted)
        found.task.tabs.update(tabId, { muted: !found.tab.muted })
      }
    })

    const close = document.createElement('button')
    close.className = 'tab-close i carbon:close'
    close.tabIndex = -1
    close.title = l('closeTab') || 'Close'
    close.addEventListener('click', function (e) {
      e.stopPropagation()
      tabHoverCard.hide()
      tabBar.events.emit('tab-closed', tabId)
    })

    const pin = document.createElement('span')
    pin.className = 'tab-pin i carbon:pin-filled'

    el.append(stripe, icon, permissions, title, audio, pin, close)

    el.addEventListener('mouseenter', function () {
      tabHoverCard.onRowMouseEnter(tabId, el)
    })

    el.addEventListener('mouseleave', function () {
      tabHoverCard.onRowMouseLeave(tabId, el)
    })

    el.addEventListener('click', function () {
      tabHoverCard.hide()
      const found = findTab(tabId)
      if (!found) {
        return
      }
      if (tasks.getSelected().id !== found.task.id) {
        browserUI().switchToTask(found.task.id)
      }
      if (tabs.getSelected() !== tabId) {
        tabBar.events.emit('tab-selected', tabId)
      } else {
        tabEditor.show(tabId)
      }
    })

    el.addEventListener('auxclick', function (e) {
      if (e.button === 1) {
        e.preventDefault()
        tabHoverCard.hide()
        tabBar.events.emit('tab-closed', tabId)
      }
    })

    el.addEventListener('mousedown', function (e) {
      if (e.button === 1) {
        e.preventDefault()
      }
    })

    const row = { el, stripe, icon, favicon, glyph, permissions, title, audio, close, faviconUrl: undefined }
    rows.set(tabId, row)
    return row
  },

  updateTab: function (tabId) {
    const row = rows.get(tabId)
    const found = findTab(tabId)
    if (!row || !found) {
      return
    }
    const tab = found.tab

    const text = tabTitle(tab)
    if (row.title.textContent !== text) {
      row.title.textContent = text
    }
    if (row.el.hasAttribute('title')) {
      row.el.removeAttribute('title')
    }
    const faviconUrl = tab.favicon && tab.favicon.url ? tab.favicon.url : null
    if (faviconUrl !== row.faviconUrl) {
      row.faviconUrl = faviconUrl
      if (faviconUrl) {
        row.favicon.src = faviconUrl
      } else {
        row.favicon.removeAttribute('src')
        row.icon.classList.add('no-favicon')
      }
    }
    let host = ''
    try {
      host = tab.url && !isNewTabUrl(tab.url) ? new URL(tab.url).hostname.replace(/^www\./, '') : ''
    } catch (e) {}
    row.glyph.textContent = host ? host[0].toUpperCase() : '+'

    row.el.classList.toggle('is-new', isNewTabUrl(tab.url))
    row.el.classList.toggle('loading', webviews.isLoading(tabId))
    row.el.classList.toggle('private', !!tab.private)
    row.el.classList.toggle('pinned', !!tab.pinned)

    const containerId = containers.sanitizeContainerId(tab.containerId)
    row.el.setAttribute('data-container', containerId)
    const container = containers.get(containerId)
    const showStripe = container && !containers.isDefault(container.id)
    row.el.classList.toggle('has-container', !!showStripe)
    row.stripe.style.backgroundColor = showStripe ? container.color : ''
    row.stripe.title = showStripe ? container.name : ''

    const audioState = tab.muted ? 'muted' : (tab.hasAudio ? 'playing' : '')
    if (row.audio.dataset.state !== audioState) {
      row.audio.dataset.state = audioState
      row.audio.classList.toggle('carbon:volume-mute', audioState === 'muted')
      row.audio.classList.toggle('carbon:volume-up', audioState === 'playing')
    }

    row.permissions.textContent = ''
    if (tasks.getSelected() && tasks.getSelected().id === found.task.id) {
      try {
        permissionRequests.getButtons(tabId).forEach(button => row.permissions.appendChild(button))
      } catch (e) {}
    }
  },

  createBucket: function (taskId) {
    const el = document.createElement('section')
    el.className = 'bucket'
    el.setAttribute('data-task', taskId)

    const head = document.createElement('div')
    head.className = 'bucket-head'

    const chevron = document.createElement('button')
    chevron.className = 'bucket-chevron i carbon:chevron-down'
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
    add.title = l('newTabAction') || 'New tab'

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
      if (renamingTaskId === taskId) {
        return
      }
      if (!tasks.get(taskId)) {
        return
      }
      if (tasks.getSelected().id !== taskId) {
        browserUI().switchToTask(taskId)
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
        browserUI().switchToTask(taskId)
      }
      const newTab = tabs.add({ containerId: containers.containerForNewTab(taskId) })
      browserUI().addTab(newTab)
    })

    const sortable = Sortable.create(list, {
      group: 'xb-tabs',
      animation: 260,
      easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.05)',
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 4,
      ghostClass: 'tab-ghost',
      chosenClass: 'tab-chosen',
      dragClass: 'tab-drag',
      filter: '.tab-close, .tab-audio',
      preventOnFilter: false,
      onStart: function () {
        tabHoverCard.hide()
        dragging = true
        document.body.classList.add('sidebar-dragging')
      },
      onEnd: function (e) {
        dragging = false
        document.body.classList.remove('sidebar-dragging')
        tabBar.commitDrop(e)
      }
    })
    const bucket = { el, head, chevron, dot, name, count, add, body, list, sortable }
    buckets.set(taskId, bucket)
    return bucket
  },

  commitDrop: function (e) {
    const tabId = e.item.getAttribute('data-tab')
    const fromTask = tasks.get(e.from.getAttribute('data-task'))
    const toTask = tasks.get(e.to.getAttribute('data-task'))
    if (!fromTask || !toTask) {
      tabBar.render()
      return
    }
    const oldIndex = fromTask.tabs.getIndex(tabId)
    if (oldIndex === -1) {
      tabBar.render()
      return
    }
    const moved = fromTask.tabs.splice(oldIndex, 1)[0]
    const order = Array.from(e.to.children).filter(c => c.classList.contains('tab-item') && !leaving.has(c.getAttribute('data-tab')))
    const newIndex = Math.max(0, order.indexOf(e.item))
    toTask.tabs.splice(newIndex, 0, moved)

    if (fromTask.id !== toTask.id) {
      if (moved.selected) {
        moved.selected = false
        const next = fromTask.tabs.get().slice().sort((a, b) => b.lastActivity - a.lastActivity)[0]
        if (next) {
          fromTask.tabs.setSelected(next.id)
        }
      }
      if (fromTask.tabs.count() === 0) {
        browserUI().closeTask(fromTask.id)
      }
      browserUI().switchToTask(toTask.id)
      browserUI().switchToTab(tabId)
    }
    tabBar.render()
  },

  toggleBucket: function (taskId, collapsed) {
    const task = tasks.get(taskId)
    if (!task) {
      return
    }
    const next = typeof collapsed === 'boolean' ? collapsed : !task.collapsed
    tasks.update(taskId, { collapsed: next })
  },

  startRename: function (taskId) {
    const bucket = buckets.get(taskId)
    const task = tasks.get(taskId)
    if (!bucket || !task || renamingTaskId) {
      return
    }
    renamingTaskId = taskId
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
      renamingTaskId = null
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
  },

  render: function () {
    renderQueued = false
    if (!tabBar.containerInner || typeof tasks === 'undefined' || !tasks.getSelected || !tasks.getSelected()) {
      return
    }
    if (dragging) {
      return
    }

    const animate = indicatorPlaced && !reduceMotion.matches
    const before = new Map()
    if (animate) {
      rows.forEach(function (row, id) {
        if (row.el.isConnected && !leaving.has(id)) {
          before.set(id, row.el.getBoundingClientRect().top)
        }
      })
    }

    const selectedTask = tasks.getSelected()
    const liveTabIds = new Set()
    const liveTaskIds = new Set()
    const entering = []

    let bucketCursor = tabBar.indicator.nextSibling
    tasks.forEach(function (task, index) {
      liveTaskIds.add(task.id)
      const bucket = buckets.get(task.id) || tabBar.createBucket(task.id)
      if (bucket.el !== bucketCursor) {
        tabBar.containerInner.insertBefore(bucket.el, bucketCursor)
      }
      bucketCursor = bucket.el.nextSibling

      bucket.el.style.setProperty('--bucket-hue', shellLayout.bucketHue(index))
      bucket.el.classList.toggle('is-current', task.id === selectedTask.id)
      bucket.el.classList.toggle('collapsed', !!task.collapsed)
      if (renamingTaskId !== task.id) {
        const name = bucketName(task, index)
        if (bucket.name.textContent !== name) {
          bucket.name.textContent = name
        }
      }
      bucket.count.textContent = String(task.tabs.count())

      let rowCursor = bucket.list.firstChild
      task.tabs.get().forEach(function (tab) {
        liveTabIds.add(tab.id)
        let row = rows.get(tab.id)
        const isNew = !row
        if (!row) {
          row = tabBar.createRow(tab.id)
        }
        while (rowCursor && leaving.has(rowCursor.getAttribute('data-tab'))) {
          rowCursor = rowCursor.nextSibling
        }
        if (row.el !== rowCursor) {
          bucket.list.insertBefore(row.el, rowCursor)
        } else {
          rowCursor = rowCursor.nextSibling
        }
        tabBar.updateTab(tab.id)
        if (isNew && animate) {
          entering.push(row.el)
        }
      })
    })

    rows.forEach(function (row, id) {
      if (!liveTabIds.has(id) && !leaving.has(id)) {
        row.el.remove()
        rows.delete(id)
      }
    })
    buckets.forEach(function (bucket, id) {
      if (!liveTaskIds.has(id)) {
        bucket.sortable.destroy()
        buckets.delete(id)
        if (animate) {
          const el = bucket.el
          el.style.overflow = 'hidden'
          el.style.pointerEvents = 'none'
          el.animate([
            { height: el.offsetHeight + 'px', opacity: 1 },
            { height: '0px', opacity: 0, transform: 'translateX(-14px)' }
          ], { duration: 320, easing: motion.spatial, fill: 'forwards' }).onfinish = () => el.remove()
        } else {
          bucket.el.remove()
        }
      }
    })

    if (animate) {
      rows.forEach(function (row, id) {
        if (!before.has(id)) {
          return
        }
        const dy = before.get(id) - row.el.getBoundingClientRect().top
        if (Math.abs(dy) > 0.5) {
          row.el.animate([
            { transform: 'translateY(' + dy + 'px)' },
            { transform: 'translateY(0)' }
          ], { duration: 420, easing: motion.spatial })
        }
      })
      entering.forEach(function (el) {
        el.animate([
          { opacity: 0, transform: 'translateX(-10px) scale(0.94)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 360, easing: motion.spatialFast })
      })
    }

    tabBar.placeIndicator(animate)
  },

  scheduleRender: function () {
    if (!renderQueued) {
      renderQueued = true
      requestAnimationFrame(tabBar.render)
    }
  },

  placeIndicator: function (animate) {
    const indicator = tabBar.indicator
    const selected = typeof tabs !== 'undefined' && tabs ? tabs.getSelected() : null
    const row = selected ? rows.get(selected) : null
    const bucketEl = row ? row.el.closest('.bucket') : null
    if (!row || !row.el.isConnected || (bucketEl && bucketEl.classList.contains('collapsed'))) {
      indicator.classList.add('hidden')
      return
    }
    rows.forEach(r => r.el.classList.toggle('active', r === row))
    row.el.setAttribute('aria-selected', 'true')

    const scroller = tabBar.containerInner
    const top = row.el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const height = row.el.offsetHeight
    indicator.style.setProperty('--bucket-hue', bucketEl ? bucketEl.style.getPropertyValue('--bucket-hue') : shellLayout.bucketHue(0))

    const wasHidden = indicator.classList.contains('hidden')
    indicator.classList.toggle('no-motion', !animate || wasHidden || !indicatorPlaced)
    indicator.style.transform = 'translateY(' + top + 'px)'
    indicator.style.height = height + 'px'
    indicator.classList.remove('hidden')
    indicatorPlaced = true

    const rowRect = row.el.getBoundingClientRect()
    const viewRect = scroller.getBoundingClientRect()
    if (rowRect.top < viewRect.top + 8 || rowRect.bottom > viewRect.bottom - 8) {
      row.el.scrollIntoView({ block: 'nearest', behavior: reduceMotion.matches ? 'auto' : 'smooth' })
    }
  },

  setActiveTab: function (tabId) {
    const found = findTab(tabId)
    if (found && found.task.collapsed) {
      tasks.update(found.task.id, { collapsed: false })
      return
    }
    tabBar.placeIndicator(!reduceMotion.matches)
  },

  updateAll: function () {
    tabBar.render()
  },

  addTab: function (tabId) {
    tabBar.render()
  },

  removeTab: function (tabId) {
    const row = rows.get(tabId)
    if (!row || !row.el.isConnected || reduceMotion.matches) {
      if (row) {
        row.el.remove()
        rows.delete(tabId)
      }
      return
    }
    leaving.add(tabId)
    rows.delete(tabId)
    const el = row.el
    el.classList.add('leaving')
    el.classList.remove('active')
    const height = el.offsetHeight
    const anim = el.animate([
      { height: height + 'px', opacity: 1, transform: 'none' },
      { height: '0px', opacity: 0, transform: 'translateX(-14px) scale(0.92)', marginTop: '0px', marginBottom: '0px' }
    ], { duration: 300, easing: motion.spatial, fill: 'forwards' })
    anim.onfinish = function () {
      el.remove()
      leaving.delete(tabId)
      tabBar.placeIndicator(true)
    }
  },

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
    motion.load()

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
      browserUI().addTask()
    })

    const structural = ['task-added', 'task-destroyed', 'tab-added', 'tab-destroyed', 'tab-splice']
    structural.forEach(name => tasks.on(name, tabBar.scheduleRender))
    tasks.on('task-updated', function (id, key) {
      if (key === 'collapsed') {
        tabBar.render()
        const bucket = buckets.get(id)
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
      tabBar.placeIndicator(!reduceMotion.matches)
    })
    webviews.bindEvent('did-start-loading', tabBar.updateTab)
    webviews.bindEvent('did-stop-loading', tabBar.updateTab)
    containers.on('changed', function () {
      rows.forEach((row, id) => tabBar.updateTab(id))
    })
    shellLayout.onChange(function () {
      requestAnimationFrame(() => tabBar.placeIndicator(false))
    })

    tabBar.container.addEventListener('dragover', function (e) {
      e.preventDefault()
    })
    tabBar.container.addEventListener('drop', function (e) {
      e.preventDefault()
      tabHoverCard.hide()
      const data = e.dataTransfer
      const path = data && data.files && data.files.length > 0 ? data.files[0].path : (data ? data.getData('text') : '')
      if (!path) {
        return
      }
      const bucketEl = e.target.closest('.bucket')
      const taskId = bucketEl ? bucketEl.getAttribute('data-task') : tasks.getSelected().id
      if (tasks.getSelected().id !== taskId) {
        browserUI().switchToTask(taskId)
      }
      const selected = tabs.get(tabs.getSelected())
      const newTab = tabs.add({
        url: path,
        private: selected ? selected.private : false,
        containerId: containers.containerForNewTab(taskId)
      })
      browserUI().addTab(newTab, { enterEditMode: false })
    })
  }
}

tabBar.initialize()

module.exports = tabBar
