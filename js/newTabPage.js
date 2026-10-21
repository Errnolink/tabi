const path = require('path')
const fs = require('fs')
const statistics = require('js/statistics.js')
const settings = require('util/settings/settings.js')
const searchbar = require('searchbar/searchbar.js')
const tabEditor = require('navbar/tabEditor.js')
const places = require('places/places.js')
const urlParser = require('util/urlParser.js')
const remoteMenu = require('remoteMenuRenderer.js')

const DEFAULT_SHORTCUTS = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' }
]

const WALLPAPER_PRESETS = [
  { id: 'stars', label: 'Starfield', className: 'ntp-wallpaper-stars' },
  { id: 'lagoon', label: 'Lagoon', className: 'ntp-wallpaper-lagoon' },
  { id: 'sunset', label: 'Sunset', className: 'ntp-wallpaper-sunset' }
]

function getFaviconUrl (url) {
  try {
    const host = new URL(url).hostname
    if (!host) return null
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=128'
  } catch (e) {
    return null
  }
}

function cleanTitleFromUrl (url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const parts = host.split('.')
    if (parts.length > 0) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    }
    return host
  } catch (e) {
    return url
  }
}

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
  imagePath: path.join(window.globalArgs['user-data-path'], 'newTabBackground'),
  blobInstance: null,

  getShortcuts: function () {
    const saved = settings.get('newTabShortcuts')
    if (Array.isArray(saved) && saved.length > 0) {
      return saved
    }
    return DEFAULT_SHORTCUTS.slice()
  },

  saveShortcuts: function (shortcuts) {
    settings.set('newTabShortcuts', shortcuts)
  },

  applyWallpaper: function (wallpaperType) {
    if (!newTabPage.wallpaperLayer) return
    newTabPage.wallpaperLayer.className = 'ntp-wallpaper'

    if (wallpaperType === 'custom' || (wallpaperType && (wallpaperType.startsWith('/') || wallpaperType.includes(':\\')))) {
      fs.readFile(newTabPage.imagePath, function (err, data) {
        if (newTabPage.blobInstance) {
          URL.revokeObjectURL(newTabPage.blobInstance)
          newTabPage.blobInstance = null
        }
        if (err) {
          if (newTabPage.background) newTabPage.background.hidden = true
          newTabPage.hasBackground = false
          newTabPage.wallpaperLayer.classList.add('ntp-wallpaper-stars')
        } else {
          const blob = new Blob([data], { type: 'application/octet-binary' })
          const url = URL.createObjectURL(blob)
          newTabPage.blobInstance = url
          if (newTabPage.background) {
            newTabPage.background.src = url
            newTabPage.background.hidden = false
          }
          newTabPage.hasBackground = true
        }
      })
    } else {
      if (newTabPage.blobInstance) {
        URL.revokeObjectURL(newTabPage.blobInstance)
        newTabPage.blobInstance = null
      }
      if (newTabPage.background) newTabPage.background.hidden = true
      newTabPage.hasBackground = false

      if (wallpaperType === 'lagoon') {
        newTabPage.wallpaperLayer.classList.add('ntp-wallpaper-lagoon')
      } else if (wallpaperType === 'sunset') {
        newTabPage.wallpaperLayer.classList.add('ntp-wallpaper-sunset')
      } else if (wallpaperType === 'none') {
        newTabPage.wallpaperLayer.classList.add('ntp-wallpaper-none')
      } else {
        newTabPage.wallpaperLayer.classList.add('ntp-wallpaper-stars')
      }
    }
    newTabPage.updateActiveSwatch(wallpaperType || 'stars')
  },

  reloadBackground: function () {
    const current = settings.get('newTabWallpaper') || 'stars'
    newTabPage.applyWallpaper(current)
  },

  updateActiveSwatch: function (activeType) {
    if (!newTabPage.customizePanel) return
    const options = newTabPage.customizePanel.querySelectorAll('.ntp-wallpaper-option')
    options.forEach(opt => {
      opt.classList.toggle('is-active', opt.dataset.id === activeType)
    })
  },

  updateClock: function () {
    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    if (newTabPage.clockTime) newTabPage.clockTime.textContent = timeStr
    if (newTabPage.clockDate) newTabPage.clockDate.textContent = dateStr
  },

  renderShortcuts: function () {
    if (!newTabPage.shortcutsGrid) return
    newTabPage.shortcutsGrid.innerHTML = ''
    const shortcuts = newTabPage.getShortcuts()

    shortcuts.forEach((shortcut, index) => {
      const item = document.createElement('div')
      item.className = 'ntp-shortcut-item'
      item.draggable = true
      item.dataset.index = index

      const tile = document.createElement('div')
      tile.className = 'ntp-shortcut-tile'

      const img = document.createElement('img')
      img.className = 'ntp-shortcut-icon'
      img.loading = 'lazy'
      img.decoding = 'async'
      const iconUrl = getFaviconUrl(shortcut.url)

      const fallback = document.createElement('div')
      fallback.className = 'ntp-shortcut-letter'
      const letter = (shortcut.title || cleanTitleFromUrl(shortcut.url) || '?').charAt(0).toUpperCase()
      fallback.textContent = letter

      if (iconUrl) {
        img.src = iconUrl
        img.onerror = function () {
          img.remove()
          if (!tile.contains(fallback)) tile.insertBefore(fallback, tile.firstChild)
        }
        tile.appendChild(img)
      } else {
        tile.appendChild(fallback)
      }

      const menuBtn = document.createElement('button')
      menuBtn.className = 'ntp-shortcut-menu-btn i carbon:overflow-menu-horizontal'
      menuBtn.tabIndex = -1
      menuBtn.title = l('openMenu') || 'Options'
      menuBtn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        const rect = menuBtn.getBoundingClientRect()
        newTabPage.showShortcutMenu(index, Math.round(rect.left), Math.round(rect.bottom + 4))
      })
      tile.appendChild(menuBtn)

      const title = document.createElement('div')
      title.className = 'ntp-shortcut-title'
      title.textContent = shortcut.title || cleanTitleFromUrl(shortcut.url)

      item.appendChild(tile)
      item.appendChild(title)

      item.addEventListener('click', function (e) {
        searchbar.openURL(shortcut.url, e)
      })

      item.addEventListener('contextmenu', function (e) {
        e.preventDefault()
        e.stopPropagation()
        newTabPage.showShortcutMenu(index, e.clientX, e.clientY)
      })

      item.addEventListener('dragstart', function (e) {
        newTabPage.draggedIndex = index
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
        item.classList.add('is-dragging')
      })

      item.addEventListener('dragover', function (e) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      })

      item.addEventListener('drop', function (e) {
        e.preventDefault()
        const from = newTabPage.draggedIndex !== null ? newTabPage.draggedIndex : parseInt(e.dataTransfer.getData('text/plain'))
        const to = index
        if (from !== null && !isNaN(from) && from !== to) {
          const list = newTabPage.getShortcuts().slice()
          const moved = list.splice(from, 1)[0]
          list.splice(to, 0, moved)
          newTabPage.saveShortcuts(list)
          newTabPage.renderShortcuts()
        }
      })

      item.addEventListener('dragend', function () {
        newTabPage.draggedIndex = null
        item.classList.remove('is-dragging')
      })

      newTabPage.shortcutsGrid.appendChild(item)
    })

    const addTileItem = document.createElement('div')
    addTileItem.className = 'ntp-shortcut-item ntp-shortcut-add'
    const addTile = document.createElement('div')
    addTile.className = 'ntp-shortcut-tile'
    const addIcon = document.createElement('i')
    addIcon.className = 'i carbon:add'
    addTile.appendChild(addIcon)

    const addTitle = document.createElement('div')
    addTitle.className = 'ntp-shortcut-title'
    addTitle.textContent = l('newTabAddShortcut') || 'Add site'

    addTileItem.appendChild(addTile)
    addTileItem.appendChild(addTitle)
    addTileItem.addEventListener('click', function () {
      newTabPage.openDialog(null)
    })

    newTabPage.shortcutsGrid.appendChild(addTileItem)
  },

  showShortcutMenu: function (index, x, y) {
    remoteMenu.open([
      [
        {
          label: l('newTabEditShortcut') || 'Edit shortcut',
          icon: 'carbon:edit',
          click: () => newTabPage.openDialog(index)
        },
        {
          label: l('newTabRemoveShortcut') || 'Remove',
          icon: 'carbon:trash-can',
          click: () => newTabPage.removeShortcut(index)
        }
      ]
    ], x, y)
  },

  removeShortcut: function (index) {
    const list = newTabPage.getShortcuts().slice()
    if (index >= 0 && index < list.length) {
      list.splice(index, 1)
      newTabPage.saveShortcuts(list)
      newTabPage.renderShortcuts()
    }
  },

  openDialog: function (index) {
    newTabPage.dialogEditingIndex = index
    if (index !== null) {
      const shortcuts = newTabPage.getShortcuts()
      const item = shortcuts[index]
      newTabPage.dialogHeading.textContent = l('newTabEditShortcut') || 'Edit shortcut'
      newTabPage.dialogTitleInput.value = item ? item.title : ''
      newTabPage.dialogUrlInput.value = item ? item.url : ''
    } else {
      newTabPage.dialogHeading.textContent = l('newTabAddShortcut') || 'Add site'
      newTabPage.dialogTitleInput.value = ''
      newTabPage.dialogUrlInput.value = ''
    }
    newTabPage.dialogOverlay.hidden = false
    newTabPage.dialogTitleInput.focus()
  },

  closeDialog: function () {
    newTabPage.dialogOverlay.hidden = true
    newTabPage.dialogEditingIndex = null
  },

  saveDialog: function () {
    let url = newTabPage.dialogUrlInput.value.trim()
    if (!url) {
      newTabPage.dialogUrlInput.focus()
      return
    }
    if (!url.includes('://')) {
      url = 'https://' + url
    }
    let title = newTabPage.dialogTitleInput.value.trim()
    if (!title) {
      title = cleanTitleFromUrl(url)
    }

    const list = newTabPage.getShortcuts().slice()
    if (newTabPage.dialogEditingIndex !== null) {
      list[newTabPage.dialogEditingIndex] = { title, url }
    } else {
      list.push({ title, url })
    }
    newTabPage.saveShortcuts(list)
    newTabPage.renderShortcuts()
    newTabPage.closeDialog()
  },

  renderBookmarks: async function () {
    if (!newTabPage.bookmarksContainer) return
    try {
      const items = await places.searchPlaces('', { searchBookmarks: true, limit: Infinity })
      newTabPage.bookmarksContainer.innerHTML = ''
      if (!items || items.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'ntp-bookmarks-empty'
        empty.textContent = l('newTabNoBookmarks') || 'No bookmarks yet'
        newTabPage.bookmarksContainer.appendChild(empty)
        return
      }

      const sorted = items.slice().sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0)).slice(0, 12)
      sorted.forEach(function (bm) {
        const chip = document.createElement('div')
        chip.className = 'ntp-bookmark-chip'
        chip.title = (bm.title || bm.url) + '\n' + bm.url

        const iconUrl = getFaviconUrl(bm.url)
        const img = document.createElement('img')
        img.loading = 'lazy'
        img.decoding = 'async'
        if (iconUrl) {
          img.src = iconUrl
          img.onerror = function () {
            img.className = 'i carbon:bookmark'
            img.removeAttribute('src')
          }
        } else {
          img.className = 'i carbon:bookmark'
        }
        chip.appendChild(img)

        const title = document.createElement('span')
        title.textContent = bm.title || urlParser.basicURL(bm.url)
        chip.appendChild(title)

        chip.addEventListener('click', function (e) {
          searchbar.openURL(bm.url, e)
        })

        newTabPage.bookmarksContainer.appendChild(chip)
      })
    } catch (e) {
      console.warn('Failed to load bookmarks on new tab page', e)
    }
  },

  buildDOM: function () {
    if (!newTabPage.container) return

    newTabPage.container.innerHTML = ''

    newTabPage.wallpaperLayer = document.createElement('div')
    newTabPage.wallpaperLayer.className = 'ntp-wallpaper ntp-wallpaper-stars'

    newTabPage.background = document.createElement('img')
    newTabPage.background.id = 'ntp-background'
    newTabPage.background.hidden = true
    newTabPage.wallpaperLayer.appendChild(newTabPage.background)

    newTabPage.scrimLayer = document.createElement('div')
    newTabPage.scrimLayer.className = 'ntp-scrim'

    newTabPage.mainEl = document.createElement('div')
    newTabPage.mainEl.className = 'ntp-main'

    const clockSection = document.createElement('div')
    clockSection.className = 'ntp-clock-section'

    newTabPage.clockTime = document.createElement('div')
    newTabPage.clockTime.className = 'ntp-clock-time'

    newTabPage.clockDate = document.createElement('div')
    newTabPage.clockDate.className = 'ntp-clock-date'

    clockSection.appendChild(newTabPage.clockTime)
    clockSection.appendChild(newTabPage.clockDate)
    newTabPage.mainEl.appendChild(clockSection)

    const searchBox = document.createElement('div')
    searchBox.className = 'ntp-search-box'
    searchBox.tabIndex = 0

    const searchIcon = document.createElement('i')
    searchIcon.className = 'i carbon:search ntp-search-icon'

    const searchPlaceholder = document.createElement('span')
    searchPlaceholder.className = 'ntp-search-placeholder'
    searchPlaceholder.textContent = l('searchbarPlaceholder') || 'Search or enter address'

    searchBox.appendChild(searchIcon)
    searchBox.appendChild(searchPlaceholder)

    searchBox.addEventListener('click', function () {
      if (window.tabs && tabs.getSelected()) {
        tabEditor.show(tabs.getSelected())
      }
    })

    searchBox.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') return
      e.preventDefault()
      if (window.tabs && tabs.getSelected()) {
        const val = e.key.length === 1 ? e.key : ''
        tabEditor.show(tabs.getSelected(), val)
      }
    })

    newTabPage.mainEl.appendChild(searchBox)

    const shortcutsSection = document.createElement('div')
    shortcutsSection.className = 'ntp-shortcuts-section'

    newTabPage.shortcutsGrid = document.createElement('div')
    newTabPage.shortcutsGrid.className = 'ntp-shortcuts-grid'
    shortcutsSection.appendChild(newTabPage.shortcutsGrid)
    newTabPage.mainEl.appendChild(shortcutsSection)

    const bookmarksSection = document.createElement('div')
    bookmarksSection.className = 'ntp-bookmarks-section'

    const bookmarksHeader = document.createElement('div')
    bookmarksHeader.className = 'ntp-section-header'
    const bmIcon = document.createElement('i')
    bmIcon.className = 'i carbon:bookmark'
    const bmLabel = document.createElement('span')
    bmLabel.textContent = l('newTabBookmarks') || 'Bookmarks'
    bookmarksHeader.appendChild(bmIcon)
    bookmarksHeader.appendChild(bmLabel)
    bookmarksSection.appendChild(bookmarksHeader)

    newTabPage.bookmarksContainer = document.createElement('div')
    newTabPage.bookmarksContainer.className = 'ntp-bookmarks-chips'
    bookmarksSection.appendChild(newTabPage.bookmarksContainer)
    newTabPage.mainEl.appendChild(bookmarksSection)

    newTabPage.customizeBtn = document.createElement('button')
    newTabPage.customizeBtn.id = 'ntp-customize-btn'
    newTabPage.customizeBtn.tabIndex = -1
    const brushIcon = document.createElement('i')
    brushIcon.className = 'i carbon:paint-brush'
    const btnLabel = document.createElement('span')
    btnLabel.textContent = l('newTabCustomize') || 'Customize'
    newTabPage.customizeBtn.appendChild(brushIcon)
    newTabPage.customizeBtn.appendChild(btnLabel)

    newTabPage.customizeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      newTabPage.customizePanel.hidden = !newTabPage.customizePanel.hidden
    })

    newTabPage.customizePanel = document.createElement('div')
    newTabPage.customizePanel.id = 'ntp-customize-panel'
    newTabPage.customizePanel.hidden = true

    const panelTitle = document.createElement('div')
    panelTitle.className = 'ntp-panel-title'
    panelTitle.textContent = l('newTabWallpaperTitle') || 'Wallpaper'
    newTabPage.customizePanel.appendChild(panelTitle)

    const wallGrid = document.createElement('div')
    wallGrid.className = 'ntp-wallpaper-grid'

    WALLPAPER_PRESETS.forEach(preset => {
      const opt = document.createElement('div')
      opt.className = 'ntp-wallpaper-option'
      opt.dataset.id = preset.id

      const swatch = document.createElement('div')
      swatch.className = 'ntp-wallpaper-swatch ' + preset.className

      const label = document.createElement('span')
      label.className = 'ntp-wallpaper-label'
      label.textContent = preset.label

      opt.appendChild(swatch)
      opt.appendChild(label)

      opt.addEventListener('click', function () {
        settings.set('newTabWallpaper', preset.id)
        newTabPage.applyWallpaper(preset.id)
      })

      wallGrid.appendChild(opt)
    })

    newTabPage.customizePanel.appendChild(wallGrid)

    const actions = document.createElement('div')
    actions.className = 'ntp-panel-actions'

    const uploadBtn = document.createElement('button')
    uploadBtn.className = 'ntp-panel-btn'
    const upIcon = document.createElement('i')
    upIcon.className = 'i carbon:image'
    const upLabel = document.createElement('span')
    upLabel.textContent = l('newTabWallpaperUpload') || 'Upload image'
    uploadBtn.appendChild(upIcon)
    uploadBtn.appendChild(upLabel)

    uploadBtn.addEventListener('click', async function () {
      const filePath = await ipc.invoke('showOpenDialog', {
        filters: [
          { name: 'Image files', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
        ]
      })
      if (filePath && filePath[0]) {
        await fs.promises.copyFile(filePath[0], newTabPage.imagePath)
        settings.set('newTabWallpaper', 'custom')
        newTabPage.applyWallpaper('custom')
      }
    })

    const noneBtn = document.createElement('button')
    noneBtn.className = 'ntp-panel-btn'
    const noneIcon = document.createElement('i')
    noneIcon.className = 'i carbon:close'
    const noneLabel = document.createElement('span')
    noneLabel.textContent = l('newTabWallpaperNone') || 'Plain sea glass'
    noneBtn.appendChild(noneIcon)
    noneBtn.appendChild(noneLabel)

    noneBtn.addEventListener('click', function () {
      settings.set('newTabWallpaper', 'none')
      newTabPage.applyWallpaper('none')
    })

    actions.appendChild(uploadBtn)
    actions.appendChild(noneBtn)
    newTabPage.customizePanel.appendChild(actions)

    document.addEventListener('click', function (e) {
      if (!newTabPage.customizePanel.hidden && !newTabPage.customizePanel.contains(e.target) && e.target !== newTabPage.customizeBtn && !newTabPage.customizeBtn.contains(e.target)) {
        newTabPage.customizePanel.hidden = true
      }
    })

    newTabPage.dialogOverlay = document.createElement('div')
    newTabPage.dialogOverlay.className = 'ntp-dialog-overlay'
    newTabPage.dialogOverlay.hidden = true

    const dialogCard = document.createElement('div')
    dialogCard.className = 'ntp-dialog-card'

    newTabPage.dialogHeading = document.createElement('div')
    newTabPage.dialogHeading.className = 'ntp-dialog-title'
    newTabPage.dialogHeading.textContent = l('newTabAddShortcut') || 'Add site'
    dialogCard.appendChild(newTabPage.dialogHeading)

    const titleGroup = document.createElement('div')
    titleGroup.className = 'ntp-form-group'
    const titleLabel = document.createElement('label')
    titleLabel.className = 'ntp-form-label'
    titleLabel.textContent = l('newTabShortcutTitle') || 'Name'
    newTabPage.dialogTitleInput = document.createElement('input')
    newTabPage.dialogTitleInput.type = 'text'
    newTabPage.dialogTitleInput.className = 'ntp-form-input'
    newTabPage.dialogTitleInput.placeholder = 'e.g. YouTube'
    titleGroup.appendChild(titleLabel)
    titleGroup.appendChild(newTabPage.dialogTitleInput)
    dialogCard.appendChild(titleGroup)

    const urlGroup = document.createElement('div')
    urlGroup.className = 'ntp-form-group'
    const urlLabel = document.createElement('label')
    urlLabel.className = 'ntp-form-label'
    urlLabel.textContent = l('newTabShortcutURL') || 'URL'
    newTabPage.dialogUrlInput = document.createElement('input')
    newTabPage.dialogUrlInput.type = 'text'
    newTabPage.dialogUrlInput.className = 'ntp-form-input'
    newTabPage.dialogUrlInput.placeholder = 'e.g. youtube.com'
    urlGroup.appendChild(urlLabel)
    urlGroup.appendChild(newTabPage.dialogUrlInput)
    dialogCard.appendChild(urlGroup)

    const dialogButtons = document.createElement('div')
    dialogButtons.className = 'ntp-dialog-buttons'

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'ntp-btn-secondary'
    cancelBtn.textContent = l('newTabCancel') || 'Cancel'
    cancelBtn.addEventListener('click', newTabPage.closeDialog)

    const saveBtn = document.createElement('button')
    saveBtn.className = 'ntp-btn-primary'
    saveBtn.textContent = l('newTabSave') || 'Save'
    saveBtn.addEventListener('click', newTabPage.saveDialog)

    dialogButtons.appendChild(cancelBtn)
    dialogButtons.appendChild(saveBtn)
    dialogCard.appendChild(dialogButtons)

    newTabPage.dialogOverlay.appendChild(dialogCard)

    newTabPage.dialogOverlay.addEventListener('click', function (e) {
      if (e.target === newTabPage.dialogOverlay) {
        newTabPage.closeDialog()
      }
    })

    newTabPage.dialogOverlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        newTabPage.closeDialog()
      } else if (e.key === 'Enter') {
        newTabPage.saveDialog()
      }
    })

    newTabPage.container.appendChild(newTabPage.wallpaperLayer)
    newTabPage.container.appendChild(newTabPage.scrimLayer)
    newTabPage.container.appendChild(newTabPage.mainEl)
    newTabPage.container.appendChild(newTabPage.customizeBtn)
    newTabPage.container.appendChild(newTabPage.customizePanel)
    newTabPage.container.appendChild(newTabPage.dialogOverlay)
  },

  initialize: function () {
    newTabPage.buildDOM()
    newTabPage.reloadBackground()
    newTabPage.updateClock()
    newTabPage.renderShortcuts()
    newTabPage.renderBookmarks()

    clearInterval(newTabPage.clockTimer)
    newTabPage.clockTimer = setInterval(newTabPage.updateClock, 1000)

    settings.listen('newTabWallpaper', function (val) {
      newTabPage.applyWallpaper(val || 'stars')
    })

    settings.listen('newTabShortcuts', function () {
      newTabPage.renderShortcuts()
    })

    if (window.tasks) {
      tasks.on('tab-selected', function (id) {
        if (window.tabs) {
          const tab = tabs.get(id)
          if (tab && !tab.url) {
            newTabPage.updateClock()
            newTabPage.renderBookmarks()
          }
        }
      })
    }

    statistics.registerGetter('ntpHasBackground', function () {
      return newTabPage.hasBackground
    })
  }
}

module.exports = newTabPage
