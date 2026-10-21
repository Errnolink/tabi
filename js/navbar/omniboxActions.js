/* global ipc, electron */

const webviews = require('webviews.js')
const glassMenu = require('glassMenu.js')
const remoteMenu = require('remoteMenuRenderer.js')
const readerView = require('readerView.js')
const containers = require('containers.js')
const tabEditor = require('navbar/tabEditor.js')
const contentBlockingToggle = require('navbar/contentBlockingToggle.js')
const webviewGestures = require('webviewGestures.js')

const siteButton = document.getElementById('site-info-button')
const zoomChip = document.getElementById('zoom-chip')
const pipButton = document.getElementById('pip-button')
const readerButton = document.getElementById('reader-button')
const copyButton = document.getElementById('copy-link-button')
const bookmarksButton = document.getElementById('bookmarks-button')
const backButton = document.getElementById('back-button')
const forwardButton = document.getElementById('forward-button')

const SITE_ICONS = ['carbon:search', 'carbon:locked', 'carbon:warning-alt', 'carbon:information']

function selected () {
  return window.tabs && tabs.getSelected() ? tabs.get(tabs.getSelected()) : null
}

function siteState (tab) {
  if (!tab || !tab.url) {
    return 'none'
  }
  if (tab.url.startsWith('https:')) {
    return 'secure'
  }
  if (tab.url.startsWith('http:')) {
    return 'insecure'
  }
  return 'internal'
}

function hostOf (url) {
  try {
    return new URL(url).hostname
  } catch (e) {
    return ''
  }
}

function anchor (el) {
  const rect = el.getBoundingClientRect()
  return { x: Math.round(rect.left), y: Math.round(rect.bottom + 6) }
}

const omniboxActions = {
  zoom: {},

  updateSite: function () {
    const state = siteState(selected())
    siteButton.classList.remove(...SITE_ICONS)
    siteButton.classList.add({ none: 'carbon:search', secure: 'carbon:locked', insecure: 'carbon:warning-alt', internal: 'carbon:information' }[state])
    siteButton.dataset.state = state
  },

  updateZoom: function () {
    const tab = selected()
    if (!tab || !webviews.hasViewForTab(tab.id)) {
      zoomChip.hidden = true
      return
    }
    webviews.callAsync(tab.id, 'zoomFactor', function (err, factor) {
      if (err || !selected() || selected().id !== tab.id) {
        return
      }
      const percent = Math.round(factor * 100)
      zoomChip.hidden = percent === 100
      zoomChip.textContent = percent + '%'
    })
  },

  updateActions: function () {
    const tab = selected()
    const isPage = !!tab && /^https?:/.test(tab.url || '')
    readerButton.hidden = !tab || !(tab.readerable || readerView.isReader(tab.id))
    readerButton.classList.toggle('active', !!tab && readerView.isReader(tab.id))
    pipButton.hidden = !tab || !tab.hasAudio
    copyButton.hidden = !isPage
  },

  updateAll: function () {
    omniboxActions.updateSite()
    omniboxActions.updateZoom()
    omniboxActions.updateActions()
  },

  showSiteInfo: function () {
    const tab = selected()
    const state = siteState(tab)
    if (state === 'none') {
      tabEditor.show(tab ? tab.id : undefined)
      return
    }
    const content = document.createElement('div')
    content.className = 'site-popover'

    const head = document.createElement('div')
    head.className = 'site-head'
    const icon = document.createElement('span')
    icon.className = 'site-state i ' + ({ secure: 'carbon:locked', insecure: 'carbon:warning-alt', internal: 'carbon:information' }[state])
    icon.dataset.state = state
    const titles = document.createElement('div')
    const host = document.createElement('div')
    host.className = 'site-host'
    host.textContent = hostOf(tab.url) || tab.url
    const sub = document.createElement('div')
    sub.className = 'site-sub'
    sub.textContent = l({ secure: 'siteSecure', insecure: 'siteInsecure', internal: 'siteInternal' }[state])
    titles.append(host, sub)
    head.append(icon, titles)
    content.appendChild(head)

    if (state !== 'internal') {
      const container = containers.get(tab.containerId)
      const rows = document.createElement('div')
      rows.className = 'site-rows'

      const row = function (label, control) {
        const r = document.createElement('div')
        r.className = 'site-row'
        const span = document.createElement('span')
        span.textContent = label
        r.append(span, control)
        rows.appendChild(r)
      }

      const chip = document.createElement('span')
      chip.className = 'site-chip'
      chip.style.setProperty('--chip-color', container.color)
      chip.textContent = container.name
      row(l('siteContainer'), chip)

      const blocking = document.createElement('input')
      blocking.type = 'checkbox'
      blocking.className = 'site-switch'
      blocking.checked = contentBlockingToggle.isBlockingEnabled(tab.url)
      blocking.addEventListener('change', function () {
        if (blocking.checked) {
          contentBlockingToggle.enableBlocking(tab.url)
        } else {
          contentBlockingToggle.disableBlocking(tab.url)
        }
      })
      row(l('siteBlocking'), blocking)

      const zoom = document.createElement('div')
      zoom.className = 'site-zoom'
      const minus = document.createElement('button')
      minus.className = 'i carbon:subtract'
      const value = document.createElement('span')
      const plus = document.createElement('button')
      plus.className = 'i carbon:add'
      const refreshZoom = () => webviews.callAsync(tab.id, 'zoomFactor', (err, f) => { if (!err) value.textContent = Math.round(f * 100) + '%' })
      minus.addEventListener('click', () => { webviewGestures.zoomWebviewOut(tab.id); setTimeout(() => { refreshZoom(); omniboxActions.updateZoom() }, 60) })
      plus.addEventListener('click', () => { webviewGestures.zoomWebviewIn(tab.id); setTimeout(() => { refreshZoom(); omniboxActions.updateZoom() }, 60) })
      value.addEventListener('click', () => { webviewGestures.resetWebviewZoom(tab.id); setTimeout(() => { refreshZoom(); omniboxActions.updateZoom() }, 60) })
      refreshZoom()
      zoom.append(minus, value, plus)
      row(l('siteZoom'), zoom)

      content.appendChild(rows)

      const clear = document.createElement('button')
      clear.className = 'site-clear'
      clear.textContent = l('siteClearData')
      clear.addEventListener('click', function () {
        if (!clear.classList.contains('armed')) {
          clear.classList.add('armed')
          clear.textContent = l('siteClearDataConfirm')
          return
        }
        ipc.invoke('clearSiteData', { url: tab.url, partition: containers.partitionFor(tab.containerId) }).then(function () {
          glassMenu.close()
          webviews.callAsync(tab.id, 'reload')
        })
      })
      content.appendChild(clear)
    }

    const pos = anchor(siteButton)
    glassMenu.openPanel(content, { x: pos.x - 6, y: pos.y })
  },

  showHistory: async function (direction, button) {
    const tab = selected()
    if (!tab) {
      return
    }
    const history = await webviews.getNavigationHistory(tab.id)
    if (!history) {
      return
    }
    const items = []
    const step = direction === 'back' ? -1 : 1
    for (let i = history.activeIndex + step; i >= 0 && i < history.entries.length && items.length < 14; i += step) {
      const entry = history.entries[i]
      const index = i
      items.push({
        label: entry.title || entry.url,
        click: () => webviews.callAsync(tab.id, 'goToIndex', [index])
      })
    }
    if (!items.length) {
      return
    }
    const pos = anchor(button)
    remoteMenu.open([items], pos.x, pos.y)
  },

  bindLongPress: function (button, direction) {
    let timer = null
    let fired = false
    button.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) {
        return
      }
      fired = false
      timer = setTimeout(function () {
        fired = true
        omniboxActions.showHistory(direction, button)
      }, 420)
    })
    const cancel = () => clearTimeout(timer)
    button.addEventListener('pointerup', cancel)
    button.addEventListener('pointerleave', cancel)
    button.addEventListener('click', function (e) {
      if (fired) {
        e.stopImmediatePropagation()
        fired = false
      }
    }, true)
    button.addEventListener('contextmenu', function (e) {
      e.preventDefault()
      e.stopPropagation()
      omniboxActions.showHistory(direction, button)
    })
  },

  initialize: function () {
    siteButton.title = 'View site information'
    zoomChip.title = 'Reset zoom (Ctrl+0)'
    readerButton.title = 'Toggle reader view (Ctrl+Shift+R)'
    pipButton.title = 'Picture in picture'
    copyButton.title = 'Copy link (Ctrl+Shift+C)'
    siteButton.addEventListener('click', function (e) {
      e.stopPropagation()
      omniboxActions.showSiteInfo()
    })
    zoomChip.addEventListener('click', function (e) {
      e.stopPropagation()
      webviewGestures.resetWebviewZoom(tabs.getSelected())
      setTimeout(omniboxActions.updateZoom, 60)
    })
    readerButton.addEventListener('click', function (e) {
      e.stopPropagation()
      const id = tabs.getSelected()
      if (readerView.isReader(id)) {
        readerView.exit(id)
      } else {
        readerView.enter(id)
      }
    })
    pipButton.addEventListener('click', function (e) {
      e.stopPropagation()
      webviews.callAsync(tabs.getSelected(), 'executeJavaScript', [`(function () {
        if (document.pictureInPictureElement) { return document.exitPictureInPicture() }
        const videos = [...document.querySelectorAll('video')].filter(v => v.readyState > 0)
        const best = videos.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0]
        if (best) { best.requestPictureInPicture() }
      })()`, true])
    })
    copyButton.addEventListener('click', function (e) {
      e.stopPropagation()
      const tab = selected()
      if (tab && tab.url) {
        electron.clipboard.writeText(tab.url)
        copyButton.classList.remove('carbon:link')
        copyButton.classList.add('carbon:checkmark', 'done')
        setTimeout(function () {
          copyButton.classList.remove('carbon:checkmark', 'done')
          copyButton.classList.add('carbon:link')
        }, 1200)
      }
    })
    bookmarksButton.title = l('showBookmarksTitle')
    bookmarksButton.addEventListener('click', function () {
      tabEditor.show(tabs.getSelected(), '!bookmarks ')
    })

    omniboxActions.bindLongPress(backButton, 'back')
    omniboxActions.bindLongPress(forwardButton, 'forward')

    tasks.on('tab-selected', omniboxActions.updateAll)
    tasks.on('task-selected', omniboxActions.updateAll)
    tasks.on('tab-updated', function (id, key) {
      if (window.tabs && id === tabs.getSelected() && ['url', 'readerable', 'hasAudio', 'containerId'].includes(key)) {
        omniboxActions.updateAll()
      }
    })
    webviews.bindEvent('did-navigate', omniboxActions.updateZoom)
    webviews.bindEvent('zoom-changed', () => setTimeout(omniboxActions.updateZoom, 60))
    window.addEventListener('keyup', function (e) {
      if (e.ctrlKey && ['=', '+', '-', '0'].includes(e.key)) {
        setTimeout(omniboxActions.updateZoom, 80)
      }
    })
    omniboxActions.updateAll()
  }
}

module.exports = omniboxActions
