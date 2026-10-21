const containers = require('containers.js')
const urlParser = require('util/urlParser.js')
const tabActions = require('tabActions.js')
const thumbnailStore = require('thumbnailStore.js')
const util = require('overview/util.js')
const overview = require('overview/overview.js')

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

function createCard (tab, task, index) {
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
      hostEl.textContent = isNew ? '' : util.hostOf(tab.url)
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
  const aspect = util.cardAspect(tab)
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
  fallback.textContent = isNew ? '+' : (util.hostOf(tab.url)[0] || '•').toUpperCase()
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
  host.textContent = isNew ? '' : util.hostOf(tab.url)
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

  card._estimate = 1 / aspect + util.CARD_META / util.MIN_COLUMN
  overview.cardCache.set(tab.id, card)
  return card
}

function cardFor (tabId) {
  return overview.el.querySelector('.ov-card[data-tab="' + tabId + '"]')
}

function visibleCards () {
  return Array.from(overview.el.querySelectorAll('.ov-card'))
}

function closeTab (tabId, card) {
  if (card && !util.reduceMotion.matches) {
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
}

module.exports = { loadThumb, createCard, cardFor, visibleCards, closeTab }
