const searchbar = require('searchbar/searchbar.js')
const remoteMenu = require('remoteMenuRenderer.js')
const settings = require('util/settings/settings.js')
const { resolveFavicon, cleanTitleFromUrl } = require('./favicons.js')

const DEFAULT_SHORTCUTS = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' }
]

module.exports = function (newTabPage) {
  function getShortcuts () {
    const saved = settings.get('newTabShortcuts')
    if (Array.isArray(saved) && saved.length > 0) {
      return saved
    }
    return DEFAULT_SHORTCUTS.slice()
  }

  function saveShortcuts (shortcuts) {
    settings.set('newTabShortcuts', shortcuts)
  }

  function renderShortcuts () {
    if (!newTabPage.shortcutsGrid) return
    newTabPage.shortcutsGrid.innerHTML = ''
    const shortcuts = getShortcuts()

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
      img.hidden = true

      const fallback = document.createElement('div')
      fallback.className = 'ntp-shortcut-letter'
      const letter = (shortcut.title || cleanTitleFromUrl(shortcut.url) || '?').charAt(0).toUpperCase()
      fallback.textContent = letter
      tile.appendChild(fallback)

      resolveFavicon(shortcut.url).then(function (dataUrl) {
        if (!img.isConnected) {
          return
        }
        if (dataUrl) {
          img.onerror = function () {
            img.hidden = true
            if (!tile.contains(fallback)) {
              tile.insertBefore(fallback, img)
            }
          }
          img.src = dataUrl
          img.hidden = false
          fallback.remove()
        }
      })
      tile.appendChild(img)

      const menuBtn = document.createElement('button')
      menuBtn.className = 'ntp-shortcut-menu-btn i carbon:overflow-menu-horizontal'
      menuBtn.tabIndex = -1
      menuBtn.title = l('openMenu') || 'Options'
      menuBtn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        const rect = menuBtn.getBoundingClientRect()
        showShortcutMenu(index, Math.round(rect.left), Math.round(rect.bottom + 4))
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
        showShortcutMenu(index, e.clientX, e.clientY)
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
          const list = getShortcuts().slice()
          const moved = list.splice(from, 1)[0]
          list.splice(to, 0, moved)
          saveShortcuts(list)
          renderShortcuts()
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
      openDialog(null)
    })

    newTabPage.shortcutsGrid.appendChild(addTileItem)
  }

  function showShortcutMenu (index, x, y) {
    remoteMenu.open([
      [
        {
          label: l('newTabEditShortcut') || 'Edit shortcut',
          icon: 'carbon:edit',
          click: () => openDialog(index)
        },
        {
          label: l('newTabRemoveShortcut') || 'Remove',
          icon: 'carbon:trash-can',
          click: () => removeShortcut(index)
        }
      ]
    ], x, y)
  }

  function removeShortcut (index) {
    const list = getShortcuts().slice()
    if (index >= 0 && index < list.length) {
      list.splice(index, 1)
      saveShortcuts(list)
      renderShortcuts()
    }
  }

  function openDialog (index) {
    newTabPage.dialogEditingIndex = index
    if (index !== null) {
      const shortcuts = getShortcuts()
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
  }

  function closeDialog () {
    newTabPage.dialogOverlay.hidden = true
    newTabPage.dialogEditingIndex = null
  }

  function saveDialog () {
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

    const list = getShortcuts().slice()
    if (newTabPage.dialogEditingIndex !== null) {
      list[newTabPage.dialogEditingIndex] = { title, url }
    } else {
      list.push({ title, url })
    }
    saveShortcuts(list)
    renderShortcuts()
    closeDialog()
  }

  function buildSection (page) {
    const shortcutsSection = document.createElement('div')
    shortcutsSection.className = 'ntp-shortcuts-section'

    page.shortcutsGrid = document.createElement('div')
    page.shortcutsGrid.className = 'ntp-shortcuts-grid'
    shortcutsSection.appendChild(page.shortcutsGrid)
    page.mainEl.appendChild(shortcutsSection)
  }

  function buildDialog (page) {
    page.dialogOverlay = document.createElement('div')
    page.dialogOverlay.className = 'ntp-dialog-overlay'
    page.dialogOverlay.hidden = true

    const dialogCard = document.createElement('div')
    dialogCard.className = 'ntp-dialog-card'

    page.dialogHeading = document.createElement('div')
    page.dialogHeading.className = 'ntp-dialog-title'
    page.dialogHeading.textContent = l('newTabAddShortcut') || 'Add site'
    dialogCard.appendChild(page.dialogHeading)

    const titleGroup = document.createElement('div')
    titleGroup.className = 'ntp-form-group'
    const titleLabel = document.createElement('label')
    titleLabel.className = 'ntp-form-label'
    titleLabel.textContent = l('newTabShortcutTitle') || 'Name'
    page.dialogTitleInput = document.createElement('input')
    page.dialogTitleInput.type = 'text'
    page.dialogTitleInput.className = 'ntp-form-input'
    page.dialogTitleInput.placeholder = 'e.g. YouTube'
    titleGroup.appendChild(titleLabel)
    titleGroup.appendChild(page.dialogTitleInput)
    dialogCard.appendChild(titleGroup)

    const urlGroup = document.createElement('div')
    urlGroup.className = 'ntp-form-group'
    const urlLabel = document.createElement('label')
    urlLabel.className = 'ntp-form-label'
    urlLabel.textContent = l('newTabShortcutURL') || 'URL'
    page.dialogUrlInput = document.createElement('input')
    page.dialogUrlInput.type = 'text'
    page.dialogUrlInput.className = 'ntp-form-input'
    page.dialogUrlInput.placeholder = 'e.g. youtube.com'
    urlGroup.appendChild(urlLabel)
    urlGroup.appendChild(page.dialogUrlInput)
    dialogCard.appendChild(urlGroup)

    const dialogButtons = document.createElement('div')
    dialogButtons.className = 'ntp-dialog-buttons'

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'ntp-btn-secondary'
    cancelBtn.textContent = l('newTabCancel') || 'Cancel'
    cancelBtn.addEventListener('click', closeDialog)

    const saveBtn = document.createElement('button')
    saveBtn.className = 'ntp-btn-primary'
    saveBtn.textContent = l('newTabSave') || 'Save'
    saveBtn.addEventListener('click', saveDialog)

    dialogButtons.appendChild(cancelBtn)
    dialogButtons.appendChild(saveBtn)
    dialogCard.appendChild(dialogButtons)

    page.dialogOverlay.appendChild(dialogCard)

    page.dialogOverlay.addEventListener('click', function (e) {
      if (e.target === page.dialogOverlay) {
        closeDialog()
      }
    })

    page.dialogOverlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDialog()
      } else if (e.key === 'Enter') {
        saveDialog()
      }
    })
  }

  return {
    methods: {
      getShortcuts,
      saveShortcuts,
      renderShortcuts,
      showShortcutMenu,
      removeShortcut,
      openDialog,
      closeDialog,
      saveDialog
    },
    buildSection,
    buildDialog
  }
}
