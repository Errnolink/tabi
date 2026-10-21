const webviews = require('webviews.js')
const permissionRequests = require('navbar/permissionRequests.js')
const containers = require('containers.js')
const tabHoverCard = require('navbar/tabHoverCard.js')
const state = require('navbar/tabBar/state.js')
const util = require('navbar/tabBar/util.js')
const tabBar = require('navbar/tabBar.js')

const rows = state.rows
const pendingFavicons = new Set()
let faviconBatchScheduled = false

function flushFaviconBatch () {
  faviconBatchScheduled = false
  let applied = 0
  for (const tabId of pendingFavicons) {
    pendingFavicons.delete(tabId)
    const row = rows.get(tabId)
    if (row && row.faviconUrl) {
      row.favicon.src = row.faviconUrl
    }
    applied++
    if (applied >= 10) {
      break
    }
  }
  if (pendingFavicons.size > 0) {
    scheduleFaviconBatch()
  }
}

function scheduleFaviconBatch () {
  if (faviconBatchScheduled) {
    return
  }
  faviconBatchScheduled = true
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(flushFaviconBatch, { timeout: 300 })
  } else {
    setTimeout(flushFaviconBatch, 32)
  }
}

function getTab (tabId) {
  const row = rows.get(tabId)
  return row ? row.el : undefined
}

function createRow (tabId) {
  const el = document.createElement('div')
  el.className = 'tab-item'
  el.setAttribute('role', 'tab')
  el.setAttribute('data-tab', tabId)

  const stripe = document.createElement('span')
  stripe.className = 'tab-stripe'

  const icon = document.createElement('span')
  icon.className = 'tab-icon no-favicon'
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
    const found = util.findTab(tabId)
    if (found && (found.tab.hasAudio || found.tab.muted)) {
      webviews.callAsync(tabId, 'setAudioMuted', !found.tab.muted)
      found.task.tabs.update(tabId, { muted: !found.tab.muted })
    }
  })

  const close = document.createElement('button')
  close.className = 'tab-close i carbon:close'
  close.tabIndex = -1
  close.title = l('closeTab')
  close.addEventListener('click', function (e) {
    e.stopPropagation()
    tabHoverCard.hide()
    tabBar.events.emit('tab-closed', tabId)
  })

  const pin = document.createElement('span')
  pin.className = 'tab-pin i carbon:pin-filled'
  pin.title = util.withShortcut(l('tabTooltipPinned'), 'togglePinTab')

  el.append(stripe, icon, permissions, title, audio, pin, close)

  el.addEventListener('mouseenter', function () {
    tabHoverCard.onRowMouseEnter(tabId, el)
  })

  el.addEventListener('mouseleave', function () {
    tabHoverCard.onRowMouseLeave(tabId, el)
  })

  el.addEventListener('click', function () {
    tabHoverCard.hide()
    const found = util.findTab(tabId)
    if (!found) {
      return
    }
    if (tasks.getSelected().id !== found.task.id) {
      util.browserUI().switchToTask(found.task.id)
    }
    if (tabs.getSelected() !== tabId) {
      tabBar.events.emit('tab-selected', tabId)
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
}

function updateTab (tabId) {
  const row = rows.get(tabId)
  const found = util.findTab(tabId)
  if (!row || !found) {
    return
  }
  const tab = found.tab

  const text = util.tabTitle(tab)
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
      pendingFavicons.add(tabId)
      scheduleFaviconBatch()
    } else {
      row.favicon.removeAttribute('src')
      row.icon.classList.add('no-favicon')
    }
  }
  let host = ''
  try {
    host = tab.url && !util.isNewTabUrl(tab.url) ? new URL(tab.url).hostname.replace(/^www\./, '') : ''
  } catch (e) {}
  row.glyph.textContent = host ? host[0].toUpperCase() : '+'

  row.el.classList.toggle('is-new', util.isNewTabUrl(tab.url))
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
    row.audio.title = audioState === 'muted' ? util.withShortcut(l('tabTooltipUnmute'), 'toggleTabAudio') : util.withShortcut(l('tabTooltipMute'), 'toggleTabAudio')
  }

  row.permissions.textContent = ''
  if (tasks.getSelected() && tasks.getSelected().id === found.task.id) {
    try {
      permissionRequests.getButtons(tabId).forEach(button => row.permissions.appendChild(button))
    } catch (e) {}
  }
}

module.exports = { getTab, createRow, updateTab }
