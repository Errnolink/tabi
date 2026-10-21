var startupSettingInput = document.getElementById('startup-options')
if (startupSettingInput) {
  settings.get('startupTabOption', function (value = 1) {
    startupSettingInput.value = value
  })

  startupSettingInput.addEventListener('change', function () {
    settings.set('startupTabOption', parseInt(this.value, 10))
  })
}

var tabSleepInput = document.getElementById('tab-sleep-options')
if (tabSleepInput) {
  settings.get('tabSleepMinutes', function (value = 60) {
    tabSleepInput.value = value
  })

  tabSleepInput.addEventListener('change', function () {
    settings.set('tabSleepMinutes', parseInt(this.value, 10))
  })
}

var newWindowSettingInput = document.getElementById('new-window-options')
if (newWindowSettingInput) {
  settings.get('newWindowOption', function (value = 1) {
    newWindowSettingInput.value = value
  })

  newWindowSettingInput.addEventListener('change', function () {
    settings.set('newWindowOption', parseInt(this.value, 10))
  })
}

var languagePicker = document.getElementById('setting-language-picker')
if (languagePicker && typeof languages !== 'undefined') {
  for (var language in languages) {
    var option = document.createElement('option')
    option.textContent = languages[language].name
    option.value = language
    languagePicker.appendChild(option)
  }

  settings.get('userSelectedLanguage', function (val) {
    if (val) {
      languagePicker.value = val
    } else {
      settings.get('language', function (fallback) {
        languagePicker.value = fallback || getCurrentLanguage()
      })
    }
  })

  languagePicker.addEventListener('change', function () {
    showRestartRequiredBanner()
    settings.set('userSelectedLanguage', this.value)
    settings.set('language', this.value)
  })
}

var openTabsInForegroundCheckbox = document.getElementById('checkbox-open-tabs-in-foreground')
if (openTabsInForegroundCheckbox) {
  settings.get('openTabsInForeground', function (value) {
    openTabsInForegroundCheckbox.checked = (value === true)
  })

  openTabsInForegroundCheckbox.addEventListener('change', function () {
    settings.set('openTabsInForeground', this.checked)
  })
}
