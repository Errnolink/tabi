var userscriptsCheckbox = document.getElementById('checkbox-userscripts')
var showUserscriptsFolderBtn = document.getElementById('btn-show-userscripts-folder')

if (userscriptsCheckbox) {
  settings.get('userscriptsEnabled', function (value) {
    userscriptsCheckbox.checked = !!value
  })

  userscriptsCheckbox.addEventListener('change', function () {
    settings.set('userscriptsEnabled', this.checked)
  })
}

if (showUserscriptsFolderBtn) {
  showUserscriptsFolderBtn.addEventListener('click', function () {
    postMessage({ message: 'showUserscriptDirectory' })
  })
}
