/* global ResizeObserver, ipc */

const keybindings = require('keybindings.js')
const browserUI = require('browserUI.js')
const focusMode = require('focusMode.js')
const modalMode = require('modalMode.js')
const util = require('overview/util.js')

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
  previewWaiter: null,

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
    search.placeholder = util.withShortcut(l('searchTabs'), 'searchTabs')
    search.spellcheck = false
    searchWrap.append(icon, search)

    const chips = document.createElement('div')
    chips.className = 'ov-chips'

    const newBucket = document.createElement('button')
    newBucket.className = 'ov-new-bucket'
    newBucket.innerHTML = '<i class="i carbon:folder-add"></i><span></span>'
    newBucket.title = util.withShortcut(l('newTask'), 'addTask')
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

const cards = require('overview/cards.js')
const filter = require('overview/filter.js')
const masonry = require('overview/masonry.js')
const dnd = require('overview/dnd.js')
const transition = require('overview/transition.js')
const keyboard = require('overview/keyboard.js')

overview.columnCount = masonry.columnCount
overview.renderChips = filter.renderChips
overview.matches = filter.matches
overview.relayout = masonry.relayout
overview.render = masonry.render
overview.createCard = cards.createCard
overview.cardFor = cards.cardFor
overview.visibleCards = cards.visibleCards
overview.closeTab = cards.closeTab
overview.makeDropTarget = dnd.makeDropTarget
overview.moveTab = dnd.moveTab
overview.swapCardThumb = transition.swapCardThumb
overview.applyFreshPreview = transition.applyFreshPreview
overview.show = transition.show
overview.hide = transition.hide
overview.freshPreview = transition.freshPreview
overview.onKeyDown = keyboard.onKeyDown
overview.moveFocus = keyboard.moveFocus
