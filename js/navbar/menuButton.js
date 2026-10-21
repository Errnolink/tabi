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
  settings.set('updateToastShownVersion', version)

  if (document.getElementById('update-toast')) {
    return
  }

  const toast = document.createElement('div')
  toast.id = 'update-toast'
  toast.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:999;display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:16px 18px 16px 17px / 17px 16px 18px 16px;background:var(--menu-fill);box-shadow:var(--menu-shadow);backdrop-filter:blur(22px) saturate(1.5);color:var(--chrome-ink);font-family:var(--font-sans);font-size:13px;'

  const label = document.createElement('span')
  label.textContent = l('updateRestartToInstall').replace('%s', version)
  toast.appendChild(label)

  const restartBtn = document.createElement('button')
  restartBtn.textContent = l('updateRestartNow')
  restartBtn.style.cssText = 'border:none;cursor:pointer;padding:5px 12px;border-radius:9999px;background:var(--menu-highlight);color:var(--chrome-ink);font-family:inherit;font-size:12.5px;font-weight:600;'
  restartBtn.addEventListener('click', function () {
    ipc.send('installUpdateNow')
  })
  toast.appendChild(restartBtn)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'i carbon:close'
  closeBtn.tabIndex = -1
  closeBtn.setAttribute('aria-label', l('closeDialog'))
  closeBtn.style.cssText = 'border:none;background:transparent;cursor:pointer;color:var(--chrome-ink);opacity:0.7;font-size:14px;padding:2px;'
  closeBtn.addEventListener('click', function () {
    toast.remove()
  })
  toast.appendChild(closeBtn)

  document.body.appendChild(toast)
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
