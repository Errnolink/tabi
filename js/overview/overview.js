/* global ResizeObserver, ipc */

const webviews = require('webviews.js')
const keybindings = require('keybindings.js')
const browserUI = require('browserUI.js')
const tabEditor = require('navbar/tabEditor.js')
const focusMode = require('focusMode.js')
const modalMode = require('modalMode.js')
const containers = require('containers.js')
const shellLayout = require('shellLayout.js')
const urlParser = require('util/urlParser.js')
const tabActions = require('tabActions.js')
const settings = require('util/settings/settings.js')
const keyMapModule = require('util/keyMap.js')
const thumbnailStore = require('thumbnailStore.js')

const MIN_COLUMN = 250
const GAP = 16
const CARD_META = 62
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const motion = {
  get spatial () { return curve('--spring-spatial') },
  get spatialFast () { return curve('--spring-spatial-fast') },
  get effects () { return curve('--spring-effects') }
}

function curve (name) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'ease-out'
}

function canMorph () {
  return typeof document.startViewTransition === 'function' && !reduceMotion.matches
}

function nextFrame () {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

function hostOf (url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

function cardAspect (tab) {
  const aspect = tab.thumbAspect
  if (typeof aspect === 'number' && isFinite(aspect) && aspect > 0) {
    return Math.min(2.4, Math.max(0.5, aspect))
  }
  return 16 / 10
}

function shortcutLabel (action) {
  const binding = keyMapModule.userKeyMap(settings.get('keyMap'))[action]
  const combo = Array.isArray(binding) ? binding[0] : binding
  if (!combo || typeof combo !== 'string') {
    return ''
  }
  return combo.split('+').map(function (part) {
    if (part === 'mod') {
      return window.platformType === 'mac' ? 'Cmd' : 'Ctrl'
    }
    if (part === 'shift') {
      return 'Shift'
    }
    if (part === 'option' || part === 'alt') {
      return window.platformType === 'mac' ? 'Option' : 'Alt'
    }
    if (part === 'super') {
      return window.platformType === 'mac' ? 'Cmd' : 'Win'
    }
    return part.charAt(0).toUpperCase() + part.slice(1)
  }).join('+')
}

function withShortcut (label, action) {
  const keys = shortcutLabel(action)
  if (!keys) {
    return label.replace(/\s*\(%s\)/, '')
  }
  return label.replace('%s', keys)
}

function loadThumb (tab, img) {
  const versionAtFetch = tab.thumbVersion
  const cached = thumbnailStore.peek(tab.id, versionAtFetch)
  if (cached) {
    img.src = cached
    return
  }
  if (thumbnailStore.failed(tab.id, versionAtFetch)) {
    const thumbEl = img.closest('.ov-thumb')
    if (thumbEl) {
      thumbEl.classList.add('empty')
    }
    return
  }
  thumbnailStore.load(tab.id, versionAtFetch).then(function (url) {
    if (!url) {
      thumbnailStore.markFailed(tab.id, versionAtFetch)
      const thumbEl = img.closest('.ov-thumb')
      if (thumbEl) {
        thumbEl.classList.add('empty')
      }
      return
    }
    const currentTask = tasks.getTaskContainingTab(tab.id)
    const currentTab = currentTask ? currentTask.tabs.get(tab.id) : null
    if (!currentTab || currentTab.thumbVersion !== versionAtFetch) {
      return
    }
    img.src = url
  })
}

const overview = {
  el: null,
  search: null,
  chips: null,
  content: null,
  isShown: false,
  busy: false,
  query: '',
  containerFilter: null,
  resizeObserver: null,
  lastColumns: 0,
  cardCache: new Map(),
  build: function () {
    const el = document.createElement('div')
    el.id = 'overview'
    el.hidden = true
    el.tabIndex = -1

    const header = document.createElement('div')
    header.className = 'ov-header'

    const searchWrap = document.createElement('label')
    searchWrap.className = 'ov-search'
    const icon = document.createElement('i')
    icon.className = 'i carbon:search'
    const search = document.createElement('input')
    search.placeholder = withShortcut(l('searchTabs'), 'searchTabs')
    search.spellcheck = false
    searchWrap.append(icon, search)

    const chips = document.createElement('div')
    chips.className = 'ov-chips'

    const newBucket = document.createElement('button')
    newBucket.className = 'ov-new-bucket'
    newBucket.innerHTML = '<i class="i carbon:folder-add"></i><span></span>'
    newBucket.title = withShortcut(l('newTask'), 'addTask')
    newBucket.querySelector('span').textContent = l('newTask')
    newBucket.addEventListener('click', function () {
      browserUI.addTask()
      overview.hide()
    })

    header.append(searchWrap, chips, newBucket)

    const content = document.createElement('div')
    content.className = 'ov-content'

    el.append(header, content)
    document.body.appendChild(el)

    let searchDebounceTimer = null
    search.addEventListener('input', function () {
      overview.query = search.value.trim().toLowerCase()
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = setTimeout(function () {
        searchDebounceTimer = null
        overview.relayout()
      }, 100)
    })
    search.addEventListener('keydown', function (e) {
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
        searchDebounceTimer = null
        overview.relayout()
      }
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        const first = overview.visibleCards()[0]
        if (first) {
          e.preventDefault()
          if (e.key === 'Enter') {
            overview.hide(first.dataset.tab)
          } else {
            first.focus()
          }
        }
      }
    })

    el.addEventListener('keydown', overview.onKeyDown)
    el.addEventListener('click', function (e) {
      if (e.target === el || e.target === content) {
        overview.hide()
      }
    })

    overview.resizeObserver = new ResizeObserver(function () {
      if (overview.isShown && overview.columnCount() !== overview.lastColumns) {
        overview.render()
      }
    })
    overview.resizeObserver.observe(content)

    overview.el = el
    overview.search = search
    overview.chips = chips
    overview.content = content
  },

  columnCount: function () {
    const width = overview.content.clientWidth - 48
    return Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP)))
  },

  renderChips: function () {
    const used = new Set()
    tasks.forEach(task => task.tabs.get().forEach(tab => used.add(containers.sanitizeContainerId(tab.containerId))))
    const list = containers.list().filter(c => used.has(c.id))
    overview.chips.textContent = ''
    if (list.length < 2) {
      overview.containerFilter = null
      return
    }
    const all = [{ id: null, name: l('allTabs') }].concat(list)
    all.forEach(function (container) {
      const chip = document.createElement('button')
      chip.className = 'ov-chip' + (overview.containerFilter === container.id ? ' active' : '')
      if (container.color) {
        chip.style.setProperty('--chip-color', container.color)
      }
      chip.textContent = container.name
      chip.addEventListener('click', function () {
        overview.containerFilter = container.id
        overview.renderChips()
        overview.relayout()
      })
      overview.chips.appendChild(chip)
    })
  },

  createCard: function (tab, task, index) {
    if (overview.cardCache.has(tab.id)) {
      const card = overview.cardCache.get(tab.id)
      card.dataset.task = task.id
      card.style.setProperty('--i', Math.min(index, 14))
      const isNew = !tab.url || tab.url === urlParser.parse('min://newtab')
      const titleEl = card.querySelector('.ov-title')
      if (titleEl) {
        titleEl.textContent = isNew ? l('newTabLabel') : (tab.title || tab.url)
      }
      const hostEl = card.querySelector('.ov-host')
      if (hostEl) {
        hostEl.textContent = isNew ? '' : hostOf(tab.url)
      }
      return card
    }
    const card = document.createElement('article')
    card.className = 'ov-card'
    card.tabIndex = 0
    card.dataset.tab = tab.id
    card.dataset.task = task.id
    card.draggable = true
    card.style.setProperty('--i', Math.min(index, 14))
    const aspect = cardAspect(tab)
    const thumb = document.createElement('div')
    thumb.className = 'ov-thumb'
    thumb.style.aspectRatio = String(aspect)
    const img = document.createElement('img')
    img.decoding = 'async'
    img.alt = ''
    img.addEventListener('error', () => thumb.classList.add('empty'))
    const fallback = document.createElement('div')
    fallback.className = 'ov-thumb-fallback'
    const isNew = !tab.url || tab.url === urlParser.parse('min://newtab')
    fallback.textContent = isNew ? '+' : (hostOf(tab.url)[0] || '•').toUpperCase()
    thumb.append(img, fallback)
    if (isNew) {
      thumb.classList.add('empty')
    } else {
      loadThumb(tab, img)
    }

    const meta = document.createElement('div')
    meta.className = 'ov-meta'
    const favicon = document.createElement('img')
    favicon.className = 'ov-favicon'
    if (tab.favicon && tab.favicon.url) {
      favicon.src = tab.favicon.url
    } else {
      favicon.hidden = true
    }
    favicon.addEventListener('error', () => { favicon.hidden = true })
    const text = document.createElement('div')
    text.className = 'ov-text'
    const title = document.createElement('div')
    title.className = 'ov-title'
    title.textContent = isNew ? l('newTabLabel') : (tab.title || tab.url)
    const host = document.createElement('div')
    host.className = 'ov-host'
    host.textContent = isNew ? '' : hostOf(tab.url)
    text.append(title, host)
    meta.append(favicon, text)

    const container = containers.get(tab.containerId)
    if (container && !containers.isDefault(container.id)) {
      const badge = document.createElement('span')
      badge.className = 'ov-container'
      badge.style.setProperty('--chip-color', container.color)
      badge.textContent = container.name
      thumb.appendChild(badge)
    }

    const close = document.createElement('button')
    close.className = 'ov-close i carbon:close'
    close.title = l('closeTab')
    close.tabIndex = -1
    close.addEventListener('click', function (e) {
      e.stopPropagation()
      overview.closeTab(tab.id, card)
    })

    card.append(thumb, meta, close)
    card.addEventListener('click', () => overview.hide(tab.id))
    card.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('application/x-tabi-tab', tab.id)
      e.dataTransfer.effectAllowed = 'move'
      card.classList.add('dragging')
      document.body.classList.add('ov-dragging')
    })
    card.addEventListener('dragend', function () {
      card.classList.remove('dragging')
      document.body.classList.remove('ov-dragging')
    })

    card._estimate = 1 / aspect + CARD_META / MIN_COLUMN
    overview.cardCache.set(tab.id, card)
    return card
  },

  makeDropTarget: function (el, taskId) {
    el.addEventListener('dragover', function (e) {
      if (e.dataTransfer.types.includes('application/x-tabi-tab')) {
        e.preventDefault()
        el.classList.add('drop-over')
      }
    })
    el.addEventListener('dragleave', function (e) {
      if (!el.contains(e.relatedTarget)) {
        el.classList.remove('drop-over')
      }
    })
    el.addEventListener('drop', function (e) {
      const tabId = e.dataTransfer.getData('application/x-tabi-tab')
      el.classList.remove('drop-over')
      if (!tabId) {
        return
      }
      e.preventDefault()
      overview.moveTab(tabId, taskId || tasks.get(tasks.add({}, tasks.getLength())).id)
    })
  },

  moveTab: function (tabId, targetTaskId) {
    tabActions.moveToTask(tabId, targetTaskId)
    overview.relayout()
  },

  closeTab: function (tabId, card) {
    if (card && !reduceMotion.matches) {
      const rect = card.getBoundingClientRect()
      const ghost = card.cloneNode(true)
      ghost.classList.add('ov-ghost')
      Object.assign(ghost.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', margin: '0', pointerEvents: 'none', zIndex: 5 })
      overview.el.appendChild(ghost)
      ghost.animate([
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'scale(0.86) translateY(8px)' }
      ], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = () => ghost.remove()
    }
    thumbnailStore.forget(tabId)
    overview.cardCache.delete(tabId)
    if (tasks.getTaskContainingTab(tabId)) {
      tabActions.close(tabId)
    }
    overview.relayout()
  },

  matches: function (tab, task) {
    if (overview.containerFilter && containers.sanitizeContainerId(tab.containerId) !== overview.containerFilter) {
      return false
    }
    if (!overview.query) {
      return true
    }
    const container = containers.get(tab.containerId)
    const haystack = [tab.title, tab.url, task.name, container && container.name].join(' ').toLowerCase()
    return overview.query.split(/\s+/).every(word => haystack.includes(word))
  },

  relayout: function () {
    if (reduceMotion.matches) {
      overview.render()
      return
    }
    const before = new Map()
    overview.el.querySelectorAll('.ov-card').forEach(card => before.set(card.dataset.tab, card.getBoundingClientRect()))
    const headsBefore = new Map()
    overview.el.querySelectorAll('.ov-bucket').forEach(section => headsBefore.set(section.dataset.task, section.getBoundingClientRect().top))
    overview.render()
    overview.el.querySelectorAll('.ov-card').forEach(function (card) {
      const old = before.get(card.dataset.tab)
      if (!old) {
        card.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: motion.spatialFast })
        return
      }
      const now = card.getBoundingClientRect()
      const dx = old.left - now.left
      const dy = old.top - now.top
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        card.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: motion.spatial })
      }
    })
    overview.el.querySelectorAll('.ov-bucket').forEach(function (section) {
      const old = headsBefore.get(section.dataset.task)
      if (old === undefined) {
        section.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: motion.effects })
        return
      }
      const dy = old - section.getBoundingClientRect().top
      if (Math.abs(dy) > 0.5) {
        section.querySelector('.ov-bucket-head').animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: motion.spatial })
      }
    })
  },

  render: function () {
    if (!overview.el) {
      return
    }
    const focusedTab = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tab : null
    const columns = overview.columnCount()
    overview.lastColumns = columns
    overview.renderChips()
    overview.content.textContent = ''
    const filtering = !!(overview.query || overview.containerFilter)

    let cardIndex = 0
    let shown = 0
    const selectedTab = tabs.getSelected()
    tasks.forEach(function (task, index) {
      const visible = task.tabs.get().filter(tab => overview.matches(tab, task))
      if (filtering && !visible.length) {
        return
      }
      shown += visible.length
      const section = document.createElement('section')
      section.className = 'ov-bucket'
      section.dataset.task = task.id
      section.style.setProperty('--bucket-hue', shellLayout.bucketHue(index))

      const head = document.createElement('div')
      head.className = 'ov-bucket-head'
      const dot = document.createElement('span')
      dot.className = 'ov-dot'
      const name = document.createElement('span')
      name.className = 'ov-bucket-name'
      name.textContent = task.name || l('defaultTaskName').replace('%n', index + 1)
      const count = document.createElement('span')
      count.className = 'ov-count'
      count.textContent = filtering ? visible.length + ' / ' + task.tabs.count() : task.tabs.count()
      const add = document.createElement('button')
      add.className = 'ov-add i carbon:add'
      add.title = withShortcut(l('newTabInGroup'), 'addTab')
      add.addEventListener('click', function () {
        browserUI.switchToTask(task.id)
        browserUI.addTab(tabs.add({ containerId: containers.containerForNewTab(task.id) }), { enterEditMode: false })
        overview.hide(tabs.getSelected())
      })
      head.append(dot, name, count, add)

      const grid = document.createElement('div')
      grid.className = 'ov-grid'
      const cols = []
      const heights = []
      for (let i = 0; i < columns; i++) {
        const col = document.createElement('div')
        col.className = 'ov-col'
        grid.appendChild(col)
        cols.push(col)
        heights.push(0)
      }
      visible.forEach(function (tab) {
        const card = overview.createCard(tab, task, cardIndex++)
        if (tab.id === selectedTab) {
          card.classList.add('current')
        }
        let shortest = 0
        for (let i = 1; i < columns; i++) {
          if (heights[i] < heights[shortest] - 0.01) {
            shortest = i
          }
        }
        cols[shortest].appendChild(card)
        heights[shortest] += card._estimate
      })

      section.append(head, grid)
      overview.makeDropTarget(section, task.id)
      overview.content.appendChild(section)
    })

    if (filtering && !shown) {
      const empty = document.createElement('div')
      empty.className = 'ov-empty'
      empty.textContent = l('noTabsMatch')
      overview.content.appendChild(empty)
    }

    const newZone = document.createElement('div')
    newZone.className = 'ov-new-zone'
    newZone.textContent = l('dropToCreateBucket')
    overview.makeDropTarget(newZone, null)
    overview.content.appendChild(newZone)

    if (focusedTab) {
      const again = overview.cardFor(focusedTab)
      if (again) {
        again.focus({ preventScroll: true })
      }
    }
  },

  cardFor: function (tabId) {
    return overview.el.querySelector('.ov-card[data-tab="' + tabId + '"]')
  },

  swapCardThumb: function (tabId) {
    if (!overview.isShown) {
      return
    }
    const owner = tasks.getTaskContainingTab(tabId)
    const tab = owner ? owner.tabs.get(tabId) : null
    const card = tab ? overview.cardFor(tabId) : null
    if (!card) {
      return
    }
    thumbnailStore.forget(tabId)
    const img = card.querySelector('.ov-thumb img')
    if (img) {
      loadThumb(tab, img)
    }
  },

  applyFreshPreview: function (tabId, promise) {
    promise.then(function () {
      overview.swapCardThumb(tabId)
    })
  },

  visibleCards: function () {
    return Array.from(overview.el.querySelectorAll('.ov-card'))
  },

  onKeyDown: function (e) {
    const active = document.activeElement
    const onCard = active && active.classList && active.classList.contains('ov-card')
    if (e.key === 'Escape') {
      e.preventDefault()
      if (overview.query && document.activeElement === overview.search) {
        overview.search.value = ''
        overview.query = ''
        overview.relayout()
      } else {
        overview.hide()
      }
      return
    }
    if (!onCard) {
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      overview.hide(active.dataset.tab)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const cards = overview.visibleCards()
      const next = cards[cards.indexOf(active) + 1] || cards[cards.indexOf(active) - 1]
      overview.closeTab(active.dataset.tab, active)
      if (next) {
        setTimeout(() => { const card = overview.cardFor(next.dataset.tab); if (card) card.focus() }, 240)
      }
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      overview.moveFocus(active, e.key)
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      overview.search.focus()
    }
  },

  moveFocus: function (from, key) {
    const a = from.getBoundingClientRect()
    const ax = a.left + a.width / 2
    const ay = a.top + a.height / 2
    let best = null
    let bestScore = Infinity
    overview.visibleCards().forEach(function (card) {
      if (card === from) {
        return
      }
      const b = card.getBoundingClientRect()
      const dx = b.left + b.width / 2 - ax
      const dy = b.top + b.height / 2 - ay
      const forward = key === 'ArrowRight' ? dx : key === 'ArrowLeft' ? -dx : key === 'ArrowDown' ? dy : -dy
      const side = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx)
      if (forward <= 4) {
        return
      }
      const score = forward + side * 2.2
      if (score < bestScore) {
        bestScore = score
        best = card
      }
    })
    if (best) {
      best.focus()
      best.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  },

  show: async function () {
    if (overview.isShown || overview.busy) {
      return
    }
    if (focusMode.enabled()) {
      focusMode.warn()
      return
    }
    if (modalMode.enabled()) {
      return
    }
    overview.busy = true
    tabEditor.hide()

    const placeholder = document.getElementById('webview-placeholder')
    const selected = tabs.getSelected()
    const morph = canMorph() && !!selected && webviews.hasViewForTab(selected)
    if (morph) {
      overview.applyFreshPreview(selected, overview.freshPreview(selected))
    }
    document.body.classList.add('overview-morph')
    webviews.requestPlaceholder('overview')
    if (morph) {
      await nextFrame()
    }

    overview.isShown = true
    overview.query = ''
    overview.search.value = ''
    document.body.classList.add('overview-is-shown')
    document.body.setAttribute('data-context', 'overview')
    document.getElementById('overview-button').classList.add('active')

    const reveal = function () {
      overview.el.hidden = false
      overview.render()
      overview.el.classList.add('entering')
      const card = overview.cardFor(tabs.getSelected())
      if (card) {
        card.scrollIntoView({ block: 'nearest' })
        if (morph) {
          placeholder.style.viewTransitionName = ''
          card.style.contentVisibility = 'visible'
          card.querySelector('.ov-thumb').style.viewTransitionName = 'tabi-page'
        }
      }
      document.body.classList.add('ov-settled')
    }

    if (morph) {
      placeholder.style.viewTransitionName = 'tabi-page'
      const transition = document.startViewTransition(reveal)
      await transition.finished.catch(() => {})
      overview.el.querySelectorAll('.ov-thumb').forEach(t => { t.style.viewTransitionName = '' })
    } else {
      reveal()
    }
    const current = overview.cardFor(tabs.getSelected()) || overview.visibleCards()[0]
    if (current) {
      current.focus({ preventScroll: true })
    } else {
      overview.search.focus()
    }
    setTimeout(() => overview.el.classList.remove('entering'), 700)
    overview.busy = false
  },

  hide: async function (targetTabId) {
    if (!overview.isShown || overview.busy) {
      return
    }
    overview.busy = true
    const targetId = targetTabId || tabs.getSelected()
    const found = targetId ? tasks.getTaskContainingTab(targetId) : null
    const card = targetId ? overview.cardFor(targetId) : null
    const thumb = card ? card.querySelector('.ov-thumb') : null
    const thumbImg = thumb && !thumb.classList.contains('empty') ? thumb.querySelector('img') : null
    const placeholder = document.getElementById('webview-placeholder')
    const morph = canMorph() && thumbImg && thumbImg.src

    const conclude = function () {
      overview.el.hidden = true
      document.body.classList.remove('ov-settled')
      overview.isShown = false
      document.body.classList.remove('overview-is-shown')
      document.body.removeAttribute('data-context')
      document.getElementById('overview-button').classList.remove('active')
      if (found) {
        if (tasks.getSelected().id !== found.id) {
          browserUI.switchToTask(found.id)
        }
        browserUI.switchToTab(targetId)
      }
      if (morph) {
        placeholder.src = thumbImg.src
        placeholder.hidden = false
        placeholder.style.viewTransitionName = 'tabi-page'
      }
    }

    if (morph) {
      thumb.style.viewTransitionName = 'tabi-page'
      const transition = document.startViewTransition(conclude)
      await transition.finished.catch(() => {})
      placeholder.style.viewTransitionName = ''
    } else {
      conclude()
    }
    webviews.hidePlaceholder('overview')
    document.body.classList.remove('overview-morph')
    overview.content.textContent = ''
    overview.busy = false
  },

  previewWaiter: null,

  freshPreview: function (tabId) {
    return new Promise(function (resolve) {
      const waiter = {
        id: tabId,
        resolve: function (ok) {
          if (overview.previewWaiter === waiter) {
            overview.previewWaiter = null
            resolve(ok)
          }
        }
      }
      overview.previewWaiter = waiter
      webviews.captureTab(tabId, { forceCapture: true })
      setTimeout(function () {
        const owner = tasks.getTaskContainingTab(tabId)
        const tab = owner && owner.tabs.get(tabId)
        waiter.resolve(!!(tab && tab.thumbAspect))
      }, 300)
    })
  },

  toggle: function () {
    if (overview.isShown) {
      overview.hide()
    } else {
      overview.show()
    }
  },

  initialize: function () {
    overview.build()

    keybindings.defineShortcut('toggleTasks', overview.toggle)
    keybindings.defineShortcut({ keys: 'mod+shift+o' }, overview.toggle)
    keybindings.defineShortcut('searchTabs', function () {
      const focusSearch = () => overview.search.focus()
      if (overview.isShown) {
        focusSearch()
      } else {
        overview.show().then(focusSearch)
      }
    })
    keybindings.defineShortcut('addTask', function () {
      if (modalMode.enabled()) {
        return
      }
      if (focusMode.enabled()) {
        focusMode.warn()
        return
      }
      browserUI.addTask()
    })
    ipc.on('addTask', function () {
      browserUI.addTask()
    })

    document.getElementById('overview-button').addEventListener('click', overview.toggle)

    tasks.on('tab-destroyed', function (tabId) {
      overview.cardCache.delete(tabId)
    })
    tasks.on('tab-updated', function (id, key) {
      if (key !== 'thumbAspect' && key !== 'thumbVersion') {
        return
      }
      if (overview.previewWaiter && overview.previewWaiter.id === id) {
        overview.previewWaiter.resolve(true)
      }
      if (key === 'thumbVersion' && overview.isShown) {
        overview.swapCardThumb(id)
      }
    })
    tasks.on('state-sync-change', function () {
      if (overview.isShown) {
        overview.render()
      }
    })
  }
}

module.exports = overview
