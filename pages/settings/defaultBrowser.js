var defaultBrowserRow = document.getElementById('default-browser-row')
var setDefaultBrowserBtn = document.getElementById('btn-set-default-browser')
var defaultBrowserStatus = document.getElementById('default-browser-status')

if (defaultBrowserRow && navigator.userAgent.indexOf('Windows') === -1) {
  defaultBrowserRow.hidden = true
}

if (setDefaultBrowserBtn) {
  settings.listen('defaultBrowserRegistered', function (registered) {
    if (defaultBrowserStatus) {
      defaultBrowserStatus.textContent = registered === true ? l('settingsDefaultBrowserRegistered') : ''
    }
  })

  setDefaultBrowserBtn.addEventListener('click', function () {
    settings.set('defaultBrowserRequested', Date.now())
    if (defaultBrowserStatus) {
      defaultBrowserStatus.textContent = l('settingsDefaultBrowserWorking')
    }
  })
}
