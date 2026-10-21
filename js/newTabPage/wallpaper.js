const path = require('path')
const fs = require('fs')
const settings = require('util/settings/settings.js')

const WALLPAPER_PRESETS = [
  { id: 'stars', label: 'Starfield', className: 'ntp-wallpaper-stars' },
  { id: 'lagoon', label: 'Lagoon', className: 'ntp-wallpaper-lagoon' },
  { id: 'sunset', label: 'Sunset', className: 'ntp-wallpaper-sunset' }
]

const imagePath = path.join(window.globalArgs['user-data-path'], 'newTabBackground')
let blobInstance = null

module.exports = function (newTabPage) {
  function applyWallpaper (wallpaperType) {
    if (!newTabPage.wallpaperLayer) return
    newTabPage.wallpaperLayer.className = 'ntp-wallpaper'

    if (wallpaperType === 'custom' || (wallpaperType && (wallpaperType.startsWith('/') || wallpaperType.includes(':\\')))) {
      fs.readFile(imagePath, function (err, data) {
        if (blobInstance) {
          URL.revokeObjectURL(blobInstance)
          blobInstance = null
        }
        if (err) {
          if (newTabPage.background) newTabPage.background.hidden = true
          newTabPage.hasBackground = false
          newTabPage.wallpaperLayer.classList.add('ntp-wallpaper-stars')
        } else {
          const blob = new Blob([data], { type: 'application/octet-binary' })
          const url = URL.createObjectURL(blob)
          blobInstance = url
          if (newTabPage.background) {
            newTabPage.background.src = url
            newTabPage.background.hidden = false
          }
          newTabPage.hasBackground = true
        }
      })
    } else {
      if (blobInstance) {
        URL.revokeObjectURL(blobInstance)
        blobInstance = null
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
  }

  function updateActiveSwatch (activeType) {
    if (!newTabPage.customizePanel) return
    const options = newTabPage.customizePanel.querySelectorAll('.ntp-wallpaper-option')
    options.forEach(opt => {
      opt.classList.toggle('is-active', opt.dataset.id === activeType)
    })
  }

  function buildLayers (page) {
    page.wallpaperLayer = document.createElement('div')
    page.wallpaperLayer.className = 'ntp-wallpaper ntp-wallpaper-stars'

    page.background = document.createElement('img')
    page.background.id = 'ntp-background'
    page.background.hidden = true
    page.wallpaperLayer.appendChild(page.background)

    page.scrimLayer = document.createElement('div')
    page.scrimLayer.className = 'ntp-scrim'
  }

  function buildCustomize (page) {
    page.customizeBtn = document.createElement('button')
    page.customizeBtn.id = 'ntp-customize-btn'
    page.customizeBtn.tabIndex = -1
    const brushIcon = document.createElement('i')
    brushIcon.className = 'i carbon:paint-brush'
    const btnLabel = document.createElement('span')
    btnLabel.textContent = l('newTabCustomize') || 'Customize'
    page.customizeBtn.appendChild(brushIcon)
    page.customizeBtn.appendChild(btnLabel)

    page.customizeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      page.customizePanel.hidden = !page.customizePanel.hidden
    })

    page.customizePanel = document.createElement('div')
    page.customizePanel.id = 'ntp-customize-panel'
    page.customizePanel.hidden = true

    const panelTitle = document.createElement('div')
    panelTitle.className = 'ntp-panel-title'
    panelTitle.textContent = l('newTabWallpaperTitle') || 'Wallpaper'
    page.customizePanel.appendChild(panelTitle)

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
        applyWallpaper(preset.id)
      })

      wallGrid.appendChild(opt)
    })

    page.customizePanel.appendChild(wallGrid)

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
        await fs.promises.copyFile(filePath[0], imagePath)
        settings.set('newTabWallpaper', 'custom')
        applyWallpaper('custom')
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
      applyWallpaper('none')
    })

    actions.appendChild(uploadBtn)
    actions.appendChild(noneBtn)
    page.customizePanel.appendChild(actions)

    document.addEventListener('click', function (e) {
      if (!page.customizePanel.hidden && !page.customizePanel.contains(e.target) && e.target !== page.customizeBtn && !page.customizeBtn.contains(e.target)) {
        page.customizePanel.hidden = true
      }
    })
  }

  return {
    methods: {
      applyWallpaper,
      updateActiveSwatch
    },
    buildLayers,
    buildCustomize
  }
}
