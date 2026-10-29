var keybindings = require('keybindings.js')
var settings = require('util/settings/settings.js')
var remoteMenu = require('remoteMenuRenderer.js')

var menuButton = document.getElementById('menu-button')

function showUpdateDot () {
  menuButton.classList.add('update-ready')
}

function showUpdateToast (version) {
  if (!version || settings.get('updateToastShownVersion') === version) {
    return
  }

  if (document.getElementById('update-toast')) {
    return
  }

  const toast = document.createElement('div')
  toast.id = 'update-toast'

  const label = document.createElement('span')
  label.textContent = l('updateRestartToInstall').replace('%s', version)
  toast.appendChild(label)

  const restartBtn = document.createElement('button')
  restartBtn.className = 'update-toast-restart'
  restartBtn.textContent = l('updateRestartNow')
  restartBtn.addEventListener('click', function () {
    ipc.send('installUpdateNow')
  })
  toast.appendChild(restartBtn)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'update-toast-close i carbon:close'
  closeBtn.tabIndex = -1
  closeBtn.setAttribute('aria-label', l('closeDialog'))
  closeBtn.addEventListener('click', function () {
    settings.set('updateToastShownVersion', version)
    toast.remove()
  })
  toast.appendChild(closeBtn)

  menuButton.parentNode.insertBefore(toast, menuButton)
}

ipc.on('update-downloaded', function (e, data) {
  showUpdateDot()
  if (data && data.version) {
    showUpdateToast(data.version)
  }
})

ipc.invoke('get-update-state').then(function (state) {
  if (state && state.ready) {
    showUpdateDot()
    if (state.version) {
      showUpdateToast(state.version)
    }
  }
})

function showSecondaryMenu () {
  var rect = menuButton.getBoundingClientRect()
  remoteMenu.openAppMenu(Math.round(rect.right), Math.round(rect.bottom + 6))
}

function initialize () {
  menuButton.addEventListener('click', function (e) {
    showSecondaryMenu()
  })

  keybindings.defineShortcut('showMenu', function () {
    if (!settings.get('useSeparateTitlebar') && (window.platformType === 'windows' || window.platformType === 'linux')) { showSecondaryMenu() }
  })
}

module.exports = { initialize, showSecondaryMenu }
