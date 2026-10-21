const settings = require('util/settings/settings.js')

const newTabPage = {
  container: document.getElementById('ntp-content'),
  background: document.getElementById('ntp-background'),
  wallpaperLayer: null,
  scrimLayer: null,
  mainEl: null,
  clockTime: null,
  clockDate: null,
  clockTimer: null,
  shortcutsGrid: null,
  bookmarksContainer: null,
  customizeBtn: null,
  customizePanel: null,
  dialogOverlay: null,
  dialogTitleInput: null,
  dialogUrlInput: null,
  dialogHeading: null,
  dialogEditingIndex: null,
  draggedIndex: null,
  hasBackground: false,
  defaultPromptEl: null,
  clockObserver: null
}

const wallpaper = require('newTabPage/wallpaper.js')(newTabPage)
const shortcuts = require('newTabPage/shortcuts.js')(newTabPage)
const bookmarks = require('newTabPage/bookmarks.js')(newTabPage)
const clock = require('newTabPage/clock.js')(newTabPage)
const searchBox = require('newTabPage/searchBox.js')(newTabPage)

Object.assign(newTabPage, wallpaper.methods, shortcuts.methods, bookmarks.methods, clock.methods)

newTabPage.requestDefaultBrowser = function () {
  ipc.invoke('setDefaultBrowser').then(function (ok) {
    if (ok) {
      newTabPage.closeDefaultPrompt()
    }
  })
}

newTabPage.closeDefaultPrompt = function () {
  if (newTabPage.defaultPromptEl && newTabPage.defaultPromptEl.isConnected) {
    newTabPage.defaultPromptEl.remove()
  }
  newTabPage.defaultPromptEl = null
}

newTabPage.buildDefaultBrowserPrompt = function () {
  if (window.platformType !== 'windows') {
    return
  }
  if (settings.get('defaultBrowserPromptDismissed') || settings.get('defaultBrowserRegistered')) {
    return
  }
  const banner = document.createElement('div')
  banner.className = 'ntp-default-prompt'
  banner.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:14px;background:rgba(255,255,255,0.12);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.22);box-shadow:0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.28);color:#fff;font-family:var(--font-sans);font-size:13px;'

  const text = document.createElement('span')
  text.textContent = l('defaultBrowserPrompt')
  banner.appendChild(text)

  const setBtn = document.createElement('button')
  setBtn.textContent = l('defaultBrowserPromptButton')
  setBtn.style.cssText = 'border:none;cursor:pointer;padding:5px 12px;border-radius:9999px;background:rgba(255,255,255,0.22);color:#fff;font-family:inherit;font-size:12.5px;font-weight:600;'
  setBtn.addEventListener('click', function (e) {
    e.stopPropagation()
    newTabPage.requestDefaultBrowser()
  })
  banner.appendChild(setBtn)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'i carbon:close'
  closeBtn.tabIndex = -1
  closeBtn.setAttribute('aria-label', l('closeDialog'))
  closeBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;color:rgba(255,255,255,0.75);font-size:14px;padding:4px;'
  closeBtn.addEventListener('click', function (e) {
    e.stopPropagation()
    settings.set('defaultBrowserPromptDismissed', true)
    newTabPage.closeDefaultPrompt()
  })
  banner.appendChild(closeBtn)

  newTabPage.defaultPromptEl = banner
  newTabPage.container.appendChild(banner)
}

newTabPage.buildDOM = function () {
  if (!newTabPage.container) return

  newTabPage.container.innerHTML = ''

  wallpaper.buildLayers(newTabPage)

  newTabPage.mainEl = document.createElement('div')
  newTabPage.mainEl.className = 'ntp-main'

  clock.buildSection(newTabPage)
  searchBox.buildSection(newTabPage)
  shortcuts.buildSection(newTabPage)
  bookmarks.buildSection(newTabPage)
  wallpaper.buildCustomize(newTabPage)
  shortcuts.buildDialog(newTabPage)

  newTabPage.container.appendChild(newTabPage.wallpaperLayer)
  newTabPage.container.appendChild(newTabPage.scrimLayer)
  newTabPage.buildDefaultBrowserPrompt()
  newTabPage.container.appendChild(newTabPage.mainEl)
  newTabPage.container.appendChild(newTabPage.customizeBtn)
  newTabPage.container.appendChild(newTabPage.customizePanel)
  newTabPage.container.appendChild(newTabPage.dialogOverlay)
}

newTabPage.initialize = function () {
  newTabPage.buildDOM()
  newTabPage.renderShortcuts()
  newTabPage.renderBookmarks()

  settings.listen('newTabWallpaper', function (val) {
    newTabPage.applyWallpaper(val || 'stars')
  })

  settings.listen('newTabShortcuts', function () {
    newTabPage.renderShortcuts()
  })

  settings.listen('defaultBrowserRequested', function (ts) {
    if (typeof ts !== 'number' || Date.now() - ts > 30000) {
      return
    }
    settings.set('defaultBrowserRequested', null)
    newTabPage.requestDefaultBrowser()
  })

  newTabPage.clockObserver = new MutationObserver(function () {
    if (document.body.classList.contains('is-ntp')) {
      newTabPage.startClock()
    } else {
      newTabPage.stopClock()
    }
  })
  newTabPage.clockObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  if (document.body.classList.contains('is-ntp')) {
    newTabPage.startClock()
  }

  if (window.tasks) {
    tasks.on('tab-selected', function (id) {
      if (window.tabs) {
        const tab = tabs.get(id)
        if (tab && !tab.url) {
          newTabPage.renderBookmarks()
        }
      }
    })
  }
}

module.exports = newTabPage
