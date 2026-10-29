/* global ipc, electron */

const glassMenu = require('glassMenu.js')
const settings = require('util/settings/settings.js')
const keyMapModule = require('util/keyMap.js')

const DOWNLOAD_HISTORY_LIMIT = 50

function shortcutLabel (binding) {
  let value = Array.isArray(binding) ? binding[0] : binding
  if (!value) {
    return ''
  }
  if (window.platformType === 'mac') {
    value = value.replace(/\bmod\b/g, 'Cmd')
  } else {
    value = value.replace(/\bmod\b/g, 'Ctrl')
  }
  return value.split('+').map(function (part) {
    return part.charAt(0).toUpperCase() + part.slice(1)
  }).join('+')
}

function sizeString (bytes) {
  const prefixes = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes || 0
  let i = 0
  while (size > 900 && i < prefixes.length - 1) {
    size /= 1024
    i++
  }
  return (Math.round(size * 10) / 10) + ' ' + prefixes[i]
}

const button = document.getElementById('downloads-button')
const ringFill = button.querySelector('.download-ring-fill')

const downloadManager = {
  items: new Map(),
  list: null,
  saveTimer: null,

  persist: function () {
    const entries = []
    downloadManager.items.forEach(function (item) {
      if (item.status === 'completed' || item.status === 'interrupted') {
        entries.push({ path: item.path, name: item.name, status: item.status, size: item.size })
      }
    })
    settings.set('downloadList', entries.slice(-DOWNLOAD_HISTORY_LIMIT))
  },

  schedulePersist: function () {
    clearTimeout(downloadManager.saveTimer)
    downloadManager.saveTimer = setTimeout(downloadManager.persist, 750)
  },

  restore: function () {
    const saved = settings.get('downloadList')
    if (!Array.isArray(saved)) {
      return
    }
    saved.slice(-DOWNLOAD_HISTORY_LIMIT).forEach(function (item) {
      if (item && item.path && (item.status === 'completed' || item.status === 'interrupted')) {
        downloadManager.items.set(item.path, {
          path: item.path,
          name: item.name || item.path.split(/[\\/]/).pop(),
          status: item.status,
          size: item.size || { received: 0, total: 0 }
        })
      }
    })
  },

  clearAll: function () {
    const doomed = []
    downloadManager.items.forEach(function (item, path) {
      if (item.status !== 'progressing') {
        doomed.push(path)
      }
    })
    doomed.forEach(function (path) {
      downloadManager.items.delete(path)
    })
    downloadManager.persist()
    downloadManager.refresh()
  },

  progress: function () {
    let received = 0
    let total = 0
    let active = 0
    downloadManager.items.forEach(function (item) {
      if (item.status === 'progressing') {
        active++
        received += item.size.received
        total += item.size.total
      }
    })
    return { active, fraction: total > 0 ? received / total : 0 }
  },

  updateButton: function () {
    const { active, fraction } = downloadManager.progress()
    const keys = shortcutLabel(keyMapModule.userKeyMap(settings.get('keyMap')).showDownloads)
    button.hidden = downloadManager.items.size === 0
    button.classList.toggle('active', active > 0)
    ringFill.style.strokeDasharray = (active > 0 ? Math.max(4, fraction * 100) : 100) + ' 100'
    button.title = active > 0 ? Math.round(fraction * 100) + '%' : l('downloadsTitle') + (keys ? ' (' + keys + ')' : '')
  },

  renderRow: function (item) {
    const row = document.createElement('div')
    row.className = 'dl-row ' + item.status

    const icon = document.createElement('span')
    icon.className = 'dl-icon i ' + (item.status === 'completed' ? 'carbon:document' : item.status === 'interrupted' ? 'carbon:warning-alt' : 'carbon:download')

    const text = document.createElement('div')
    text.className = 'dl-text'
    const name = document.createElement('div')
    name.className = 'dl-name'
    name.textContent = item.name
    const meta = document.createElement('div')
    meta.className = 'dl-meta'
    if (item.status === 'completed') {
      meta.textContent = sizeString(item.size.total)
    } else if (item.status === 'interrupted') {
      meta.textContent = l('downloadStateFailed')
    } else {
      meta.textContent = sizeString(item.size.received) + ' / ' + sizeString(item.size.total)
    }
    text.append(name, meta)

    if (item.status === 'progressing') {
      const bar = document.createElement('div')
      bar.className = 'dl-bar'
      bar.style.setProperty('--p', item.size.total ? item.size.received / item.size.total : 0)
      text.appendChild(bar)
    }

    const actions = document.createElement('div')
    actions.className = 'dl-actions'
    const action = function (iconName, title, fn) {
      const b = document.createElement('button')
      b.className = 'dl-action i ' + iconName
      b.title = title
      b.addEventListener('click', function (e) {
        e.stopPropagation()
        fn()
      })
      actions.appendChild(b)
    }
    if (item.status === 'progressing') {
      action('carbon:close', l('downloadCancel'), function () {
        ipc.send('cancelDownload', item.path)
      })
    } else {
      action('carbon:folder', l('downloadShowInFolder'), () => ipc.invoke('showItemInFolder', item.path))
      action('carbon:close', l('downloadRemove'), function () {
        downloadManager.items.delete(item.path)
        downloadManager.persist()
        downloadManager.refresh()
      })
    }

    row.append(icon, text, actions)
    row.addEventListener('click', function () {
      if (item.status === 'completed') {
        electron.shell.openPath(item.path)
        glassMenu.close()
      }
    })
    row.draggable = item.status === 'completed'
    row.addEventListener('dragstart', function (e) {
      e.preventDefault()
      ipc.invoke('startFileDrag', item.path)
    })
    return row
  },

  refresh: function () {
    downloadManager.updateButton()
    if (!downloadManager.list || !downloadManager.list.isConnected) {
      return
    }
    downloadManager.list.textContent = ''
    if (downloadManager.items.size === 0) {
      const empty = document.createElement('div')
      empty.className = 'dl-empty'
      empty.textContent = l('downloadsEmpty')
      downloadManager.list.appendChild(empty)
      return
    }
    Array.from(downloadManager.items.values()).reverse().forEach(function (item) {
      downloadManager.list.appendChild(downloadManager.renderRow(item))
    })
  },

  openPopover: function () {
    const content = document.createElement('div')
    content.className = 'dl-popover'
    const head = document.createElement('div')
    head.className = 'dl-head'
    head.textContent = l('downloadsTitle')
    const clear = document.createElement('button')
    clear.className = 'dl-clear'
    clear.textContent = l('downloadsClear')
    clear.addEventListener('click', function () {
      downloadManager.clearAll()
    })
    head.appendChild(clear)
    downloadManager.list = document.createElement('div')
    downloadManager.list.className = 'dl-list'
    content.append(head, downloadManager.list)
    let x, y
    if (button.hidden) {
      x = window.innerWidth - 16
      y = 52
    } else {
      const rect = button.getBoundingClientRect()
      x = Math.round(rect.right)
      y = Math.round(rect.bottom + 6)
    }
    glassMenu.openPanel(content, { x: x, y: y, onClose: () => { downloadManager.list = null } })
    downloadManager.refresh()
  },

  initialize: function () {
    downloadManager.restore()
    downloadManager.updateButton()
    button.addEventListener('click', downloadManager.openPopover)

    ipc.on('download-info', function (e, info) {
      if (!info.path) {
        return
      }
      if (info.status === 'cancelled') {
        downloadManager.items.delete(info.path)
      } else {
        const isNew = !downloadManager.items.has(info.path)
        downloadManager.items.set(info.path, info)
        if (isNew) {
          button.classList.remove('bump')
          button.getBoundingClientRect()
          button.classList.add('bump')
        }
      }
      if (info.status === 'progressing') {
        downloadManager.schedulePersist()
      } else {
        downloadManager.persist()
      }
      downloadManager.refresh()
    })
  }
}

module.exports = downloadManager
