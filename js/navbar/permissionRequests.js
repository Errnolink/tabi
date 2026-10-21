const { ipcRenderer } = require('electron')
const webviews = require('webviews.js')

const permissionRequests = {
  requests: [],
  listeners: [],
  chipEl: null,

  grantPermission: function (permissionId) {
    permissionRequests.requests.forEach(function (request) {
      if (request.permissionId && request.permissionId === permissionId) {
        ipcRenderer.send('permissionGranted', permissionId)
      }
    })
    permissionRequests.updateChip()
  },

  denyPermission: function (permissionId) {
    permissionRequests.requests.forEach(function (request) {
      if (request.permissionId && request.permissionId === permissionId) {
        ipcRenderer.send('permissionDenied', permissionId)
      }
    })
    permissionRequests.requests = permissionRequests.requests.filter(r => r.permissionId !== permissionId)
    permissionRequests.listeners.forEach(listener => listener(null))
    permissionRequests.updateChip()
  },

  getIcons: function (request) {
    if (request.permission === 'notifications') {
      return ['carbon:chat']
    } else if (request.permission === 'pointerLock') {
      return ['carbon:cursor-1']
    } else if (request.permission === 'geolocation' || request.permission === 'location') {
      return ['carbon:location']
    } else if (request.permission === 'media') {
      const mediaIcons = {
        video: 'carbon:video',
        audio: 'carbon:microphone'
      }
      if (request.details && Array.isArray(request.details.mediaTypes)) {
        return request.details.mediaTypes.map(t => mediaIcons[t]).filter(Boolean)
      }
      if (request.details && request.details.mediaType) {
        return [mediaIcons[request.details.mediaType]].filter(Boolean)
      }
      return ['carbon:video']
    }
    return []
  },

  getLabel: function (request) {
    if (request.permission === 'notifications') {
      return l('permissionNotificationPrompt') || 'Show notifications?'
    } else if (request.permission === 'pointerLock') {
      return l('permissionPointerLockPrompt') || 'Lock mouse cursor?'
    } else if (request.permission === 'geolocation' || request.permission === 'location') {
      return l('permissionLocationPrompt') || 'Access your location?'
    } else if (request.permission === 'media') {
      const types = (request.details && request.details.mediaTypes) || (request.details && request.details.mediaType ? [request.details.mediaType] : ['video'])
      const hasVideo = types.includes('video')
      const hasAudio = types.includes('audio')
      if (hasVideo && hasAudio) {
        return l('permissionCameraAndMicrophonePrompt') || 'Use camera & microphone?'
      }
      if (hasVideo) {
        return l('permissionCameraPrompt') || 'Use your camera?'
      }
      if (hasAudio) {
        return l('permissionMicrophonePrompt') || 'Use your microphone?'
      }
      return 'Use media devices?'
    }
    return 'Allow permission?'
  },

  getButtons: function (tabId) {
    const buttons = []
    permissionRequests.requests.forEach(function (request) {
      const icons = permissionRequests.getIcons(request)
      if (icons.length === 0) {
        return
      }

      if (request.tabId === tabId) {
        const button = document.createElement('button')
        button.className = 'tab-icon permission-request-icon'
        if (request.granted) {
          button.classList.add('active')
          button.title = 'Permission granted (click to reload)'
        } else {
          button.title = 'Permission requested (click to allow)'
        }
        icons.forEach(function (icon) {
          const el = document.createElement('i')
          el.className = 'i ' + icon
          button.appendChild(el)
        })
        button.addEventListener('click', function (e) {
          e.stopPropagation()
          if (request.granted) {
            webviews.callAsync(tabId, 'reload')
          } else {
            permissionRequests.grantPermission(request.permissionId)
            button.classList.add('active')
          }
        })
        buttons.push(button)
      }
    })
    return buttons
  },

  ensureChip: function () {
    if (permissionRequests.chipEl && permissionRequests.chipEl.isConnected) {
      return permissionRequests.chipEl
    }
    const tabEditor = document.getElementById('tab-editor')
    if (!tabEditor) {
      return null
    }
    let chip = document.getElementById('permission-chip')
    if (!chip) {
      chip = document.createElement('div')
      chip.id = 'permission-chip'
      chip.className = 'permission-chip'
      chip.hidden = true

      const icon = document.createElement('i')
      icon.className = 'permission-chip-icon i'

      const text = document.createElement('span')
      text.className = 'permission-chip-text'

      const allowBtn = document.createElement('button')
      allowBtn.className = 'permission-chip-btn permission-allow'
      allowBtn.textContent = l('permissionAllow') || 'Allow'

      const blockBtn = document.createElement('button')
      blockBtn.className = 'permission-chip-btn permission-block'
      blockBtn.textContent = l('permissionBlock') || 'Block'

      chip.append(icon, text, allowBtn, blockBtn)

      const omniboxActions = document.getElementById('omnibox-actions')
      if (omniboxActions) {
        tabEditor.insertBefore(chip, omniboxActions)
      } else {
        tabEditor.appendChild(chip)
      }
    }

    permissionRequests.chipEl = chip
    return chip
  },

  updateChip: function () {
    const chip = permissionRequests.ensureChip()
    if (!chip) {
      return
    }
    const currentTabId = typeof tabs !== 'undefined' && tabs.getSelected ? tabs.getSelected() : null
    if (!currentTabId) {
      chip.hidden = true
      return
    }

    const pendingReq = permissionRequests.requests.find(r => r.tabId === currentTabId && !r.granted)
    if (!pendingReq) {
      chip.hidden = true
      return
    }

    const icons = permissionRequests.getIcons(pendingReq)
    const iconEl = chip.querySelector('.permission-chip-icon')
    if (iconEl) {
      iconEl.className = 'permission-chip-icon i ' + (icons[0] || 'carbon:locked')
    }

    const textEl = chip.querySelector('.permission-chip-text')
    if (textEl) {
      textEl.textContent = permissionRequests.getLabel(pendingReq)
    }

    const allowBtn = chip.querySelector('.permission-allow')
    if (allowBtn) {
      allowBtn.onclick = function (e) {
        e.stopPropagation()
        permissionRequests.grantPermission(pendingReq.permissionId)
      }
    }

    const blockBtn = chip.querySelector('.permission-block')
    if (blockBtn) {
      blockBtn.onclick = function (e) {
        e.stopPropagation()
        permissionRequests.denyPermission(pendingReq.permissionId)
      }
    }

    chip.hidden = false
  },

  onChange: function (listener) {
    permissionRequests.listeners.push(listener)
  },

  initialize: function () {
    ipcRenderer.on('updatePermissions', function (e, data) {
      const oldData = permissionRequests.requests
      permissionRequests.requests = data
      oldData.forEach(function (req) {
        permissionRequests.listeners.forEach(listener => listener(req.tabId))
      })
      permissionRequests.requests.forEach(function (req) {
        permissionRequests.listeners.forEach(listener => listener(req.tabId))
      })
      permissionRequests.updateChip()
    })

    const attach = function () {
      if (typeof tasks !== 'undefined' && tasks && tasks.on) {
        tasks.on('tab-selected', permissionRequests.updateChip)
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach)
    } else {
      attach()
    }
  }
}

permissionRequests.initialize()

module.exports = permissionRequests
