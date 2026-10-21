const uiLayer = require('uiLayer.js')
const urlParser = require('util/urlParser.js')
const containers = require('containers.js')
const shellLayout = require('shellLayout.js')
const webviews = require('webviews.js')
const discardInactive = require('discardInactive.js')
const thumbnailStore = require('thumbnailStore.js')

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const STALE_THUMB_AGE = 10000

let el = null
let thumbWrap = null
let thumbImg = null
let iconWrap = null
let faviconImg = null
let glyphEl = null
let titleEl = null
let hostEl = null
let chipWrap = null
let chipText = null

let hoverTimer = null
let hideTimer = null
let isCardVisible = false
let isHiding = false
let currentTabId = null
let currentRowEl = null
let pendingTabId = null
let warmTimer = null
let warmTabId = null
const warmedTabs = new Map()

function canWarmTab (tabId) {
  if (warmedTabs.size >= 2 || warmedTabs.has(tabId)) {
    return false
  }
  const found = findTab(tabId)
  if (!found || found.tab.private || !found.tab.url || isNewTabUrl(found.tab.url)) {
    return false
  }
  if (typeof tabs !== 'undefined' && tabs.getSelected && tabs.getSelected() === tabId) {
    return false
  }
  if (webviews.hasViewForTab(tabId) || !discardInactive.canWarmUp()) {
    return false
  }
  return true
}

function triggerWarmUp (tabId) {
  if (!canWarmTab(tabId)) {
    return
  }
  webviews.warmUp(tabId)
  const timer = setTimeout(function () {
    warmedTabs.delete(tabId)
    if (typeof tabs !== 'undefined' && tabs.getSelected && tabs.getSelected() !== tabId && webviews.hasViewForTab(tabId)) {
      webviews.destroy(tabId)
    }
  }, 60000)
  warmedTabs.set(tabId, timer)
}

function scheduleWarmUp (tabId) {
  cancelWarmUp(warmTabId)
  if (!canWarmTab(tabId)) {
    return
  }
  warmTabId = tabId
  warmTimer = setTimeout(function () {
    warmTimer = null
    const target = warmTabId
    warmTabId = null
    if (target) {
      triggerWarmUp(target)
    }
  }, 500)
}

function cancelWarmUp (tabId) {
  if (warmTabId === tabId) {
    clearTimeout(warmTimer)
    warmTimer = null
    warmTabId = null
  }
}

function requestSelectedThumbRefresh (tabId) {
  if (tabs.getSelected() !== tabId) {
    return
  }
  const filePath = thumbnailStore.getPath(tabId)
  if (!filePath || !window.fs || !window.fs.promises) {
    return
  }
  window.fs.promises.stat(filePath).then(function (stats) {
    return Date.now() - stats.mtimeMs
  }).catch(function () {
    return Infinity
  }).then(function (age) {
    if (age >= STALE_THUMB_AGE && currentTabId === tabId && isCardVisible) {
      webviews.captureTab(tabId)
    }
  })
}

function findTab (tabId) {
  if (typeof tasks === 'undefined' || !tasks.getTaskContainingTab) {
    return null
  }
  const task = tasks.getTaskContainingTab(tabId)
  return task ? { task, tab: task.tabs.get(tabId) } : null
}

function isNewTabUrl (url) {
  return !url || url === urlParser.parse('min://newtab')
}

function getTabTitle (tab) {
  if (isNewTabUrl(tab.url)) {
    return l('newTabLabel')
  }
  return (tab.title || (tab.loaded ? tab.url : '') || tab.url || l('newTabLabel')).substring(0, 300)
}

function getTabHost (url) {
  if (!url || isNewTabUrl(url)) {
    return ''
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'min:') {
      return 'tabi'
    }
    return parsed.hostname.replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

function positionCard (rowEl) {
  if (!el || !rowEl || !rowEl.isConnected) {
    return
  }
  const sidebar = document.getElementById('sidebar')
  const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : { right: shellLayout.effectiveSidebarWidth() }
  const rowRect = rowEl.getBoundingClientRect()

  const anchorX = sidebarRect.right + 8
  const cardWidth = el.offsetWidth || 260
  const cardHeight = el.offsetHeight || 180

  let left = anchorX
  if (left + cardWidth > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - cardWidth - 8)
  }

  let top = rowRect.top + (rowRect.height - cardHeight) / 2
  top = Math.max(8, Math.min(window.innerHeight - cardHeight - 8, top))

  el.style.left = Math.round(left) + 'px'
  el.style.top = Math.round(top) + 'px'
}

function updateCardContent (tabId, rowEl) {
  const found = findTab(tabId)
  if (!found) {
    return false
  }
  const tab = found.tab

  titleEl.textContent = getTabTitle(tab)
  const host = getTabHost(tab.url)
  hostEl.textContent = host

  const containerId = containers.sanitizeContainerId(tab.containerId)
  const container = containers.get(containerId)
  if (container && !containers.isDefault(container.id)) {
    chipWrap.style.setProperty('--chip-color', container.color)
    chipText.textContent = container.name
    chipWrap.hidden = false
  } else {
    chipWrap.hidden = true
  }

  const faviconUrl = tab.favicon && tab.favicon.url ? tab.favicon.url : null
  if (faviconUrl) {
    faviconImg.src = faviconUrl
    faviconImg.hidden = false
    glyphEl.hidden = true
  } else {
    faviconImg.removeAttribute('src')
    faviconImg.hidden = true
    glyphEl.textContent = host ? host[0].toUpperCase() : '+'
    glyphEl.hidden = false
  }

  const syncThumb = thumbnailStore.peek(tab.id, tab.thumbVersion)
  if (syncThumb) {
    thumbImg.src = syncThumb
    thumbWrap.hidden = false
    el.classList.remove('no-thumb')
  } else {
    thumbImg.removeAttribute('src')
    thumbWrap.hidden = true
    el.classList.add('no-thumb')
    thumbnailStore.load(tab.id, tab.thumbVersion).then(function (url) {
      if (currentTabId === tabId && isCardVisible && url) {
        thumbImg.src = url
        thumbWrap.hidden = false
        el.classList.remove('no-thumb')
        positionCard(rowEl)
      }
    })
  }
  return true
}

function buildCard () {
  if (el) {
    return
  }
  el = document.createElement('div')
  el.id = 'tab-hover-card'
  el.className = 'tab-hover-card'
  el.hidden = true

  thumbWrap = document.createElement('div')
  thumbWrap.className = 'tab-hover-thumb-wrap'
  thumbImg = document.createElement('img')
  thumbImg.className = 'tab-hover-thumb'
  thumbImg.alt = ''
  thumbWrap.appendChild(thumbImg)

  const body = document.createElement('div')
  body.className = 'tab-hover-body'

  const header = document.createElement('div')
  header.className = 'tab-hover-header'

  iconWrap = document.createElement('span')
  iconWrap.className = 'tab-hover-icon'

  faviconImg = document.createElement('img')
  faviconImg.className = 'tab-hover-favicon'
  faviconImg.alt = ''
  faviconImg.decoding = 'async'
  faviconImg.addEventListener('error', function () {
    faviconImg.hidden = true
    glyphEl.hidden = false
  })
  faviconImg.addEventListener('load', function () {
    faviconImg.hidden = false
    glyphEl.hidden = true
  })

  glyphEl = document.createElement('span')
  glyphEl.className = 'tab-hover-glyph'

  iconWrap.append(faviconImg, glyphEl)

  titleEl = document.createElement('div')
  titleEl.className = 'tab-hover-title'

  header.append(iconWrap, titleEl)

  const footer = document.createElement('div')
  footer.className = 'tab-hover-footer'

  hostEl = document.createElement('span')
  hostEl.className = 'tab-hover-host'

  chipWrap = document.createElement('span')
  chipWrap.className = 'tab-hover-chip'
  chipWrap.hidden = true

  const chipDot = document.createElement('span')
  chipDot.className = 'tab-hover-chip-dot'

  chipText = document.createElement('span')
  chipText.className = 'tab-hover-chip-text'

  chipWrap.append(chipDot, chipText)
  footer.append(hostEl, chipWrap)

  body.append(header, footer)
  el.append(thumbWrap, body)
  document.body.appendChild(el)
}

function show (tabId, rowEl) {
  clearTimeout(hoverTimer)
  clearTimeout(hideTimer)
  hoverTimer = null
  hideTimer = null
  isHiding = false

  if (!updateCardContent(tabId, rowEl)) {
    tabHoverCard.hide()
    return
  }

  currentTabId = tabId
  currentRowEl = rowEl
  isCardVisible = true

  el.hidden = false
  positionCard(rowEl)
  uiLayer.raise('tab-hover-card', { focus: false })
  triggerWarmUp(tabId)

  requestSelectedThumbRefresh(tabId)

  requestAnimationFrame(function () {
    if (isCardVisible && currentTabId === tabId) {
      el.classList.add('visible')
    }
  })
}

const tabHoverCard = {
  initialize: function () {
    buildCard()

    window.addEventListener('pointerdown', function (e) {
      const row = e.target.closest && e.target.closest('.tab-item')
      if (row) {
        const id = row.getAttribute('data-tab')
        if (id) {
          triggerWarmUp(id)
        }
      }
      tabHoverCard.hide()
    }, true)
    window.addEventListener('blur', tabHoverCard.hide)
    window.addEventListener('keydown', tabHoverCard.hide, true)
    window.addEventListener('contextmenu', tabHoverCard.hide, true)
    window.addEventListener('resize', tabHoverCard.hide)

    if (typeof tasks !== 'undefined' && tasks && tasks.on) {
      tasks.on('tab-destroyed', function (tabId) {
        if (currentTabId === tabId) {
          tabHoverCard.hide()
        }
        if (warmedTabs.has(tabId)) {
          clearTimeout(warmedTabs.get(tabId))
          warmedTabs.delete(tabId)
        }
      })
      tasks.on('tab-selected', function (tabId) {
        tabHoverCard.hide()
        if (warmedTabs.has(tabId)) {
          clearTimeout(warmedTabs.get(tabId))
          warmedTabs.delete(tabId)
        }
      })
      tasks.on('task-updated', function (taskId, key) {
        if (key === 'collapsed') {
          tabHoverCard.hide()
        }
      })
      tasks.on('tab-updated', function (tabId) {
        if (currentTabId === tabId && isCardVisible && currentRowEl) {
          updateCardContent(tabId, currentRowEl)
        }
      })
    }

    const originalRaise = uiLayer.raise
    uiLayer.raise = function (reason, options) {
      if (reason !== 'tab-hover-card') {
        tabHoverCard.hide()
      }
      return originalRaise.apply(this, arguments)
    }
  },

  onRowMouseEnter: function (tabId, rowEl) {
    clearTimeout(hideTimer)
    scheduleWarmUp(tabId)
    if (isCardVisible) {
      show(tabId, rowEl)
    } else {
      clearTimeout(hoverTimer)
      pendingTabId = tabId
      const found = findTab(tabId)
      if (found) {
        thumbnailStore.load(found.tab.id, found.tab.thumbVersion)
      }
      hoverTimer = setTimeout(function () {
        if (pendingTabId === tabId) {
          show(tabId, rowEl)
        }
      }, 500)
    }
  },

  onRowMouseLeave: function (tabId, rowEl) {
    cancelWarmUp(tabId)
    if (!isCardVisible) {
      if (pendingTabId === tabId) {
        clearTimeout(hoverTimer)
        hoverTimer = null
        pendingTabId = null
      }
    }
  },

  hide: function () {
    clearTimeout(hoverTimer)
    hoverTimer = null
    pendingTabId = null
    cancelWarmUp(warmTabId)

    if (!isCardVisible && !isHiding) {
      return
    }

    isCardVisible = false
    currentTabId = null
    currentRowEl = null
    uiLayer.lower('tab-hover-card')

    if (!el) {
      return
    }

    el.classList.remove('visible')
    if (reduceMotion.matches) {
      el.hidden = true
      isHiding = false
    } else {
      isHiding = true
      clearTimeout(hideTimer)
      hideTimer = setTimeout(function () {
        if (!isCardVisible) {
          el.hidden = true
          isHiding = false
        }
      }, 140)
    }
  }
}

module.exports = tabHoverCard
