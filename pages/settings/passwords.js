var passwordManagersDropdown = document.getElementById('selected-password-manager')
if (passwordManagersDropdown && typeof passwordManagers !== 'undefined') {
  for (var mgr in passwordManagers) {
    var pOption = document.createElement('option')
    pOption.textContent = passwordManagers[mgr].name
    pOption.value = passwordManagers[mgr].name
    passwordManagersDropdown.appendChild(pOption)
  }

  settings.listen('passwordManager', function () {
    if (typeof currentPasswordManager !== 'undefined' && currentPasswordManager) {
      passwordManagersDropdown.value = currentPasswordManager.name
    }
  })

  passwordManagersDropdown.addEventListener('change', function () {
    if (this.value === 'none') {
      settings.set('passwordManager', { name: 'none' })
    } else {
      settings.set('passwordManager', { name: this.value })
    }
  })
}

var keychainViewLink = document.getElementById('keychain-view-link')
var viewPasswordsBtn = document.getElementById('btn-view-passwords')

function openCredentialList () {
  postMessage({ message: 'showCredentialList' })
}

if (keychainViewLink) {
  keychainViewLink.addEventListener('click', openCredentialList)
}
if (viewPasswordsBtn) {
  viewPasswordsBtn.addEventListener('click', openCredentialList)
}

settings.listen('passwordManager', function () {
  if (keychainViewLink) {
    keychainViewLink.hidden = !(typeof currentPasswordManager !== 'undefined' && currentPasswordManager && currentPasswordManager.name === 'Built-in password manager')
  }
})
