var keybindings = require('keybindings.js')
var settings = require('util/settings/settings.js')
var remoteMenu = require('remoteMenuRenderer.js')

var menuButton = document.getElementById('menu-button')

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
