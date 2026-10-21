var separateTitlebarCheckbox = document.getElementById('checkbox-separate-titlebar')
var autoPlayCheckbox = document.getElementById('checkbox-enable-autoplay')
var userAgentCheckbox = document.getElementById('checkbox-user-agent')
var userAgentInput = document.getElementById('input-user-agent')

if (separateTitlebarCheckbox) {
  settings.get('useSeparateTitlebar', function (value) {
    separateTitlebarCheckbox.checked = (value === true)
  })

  separateTitlebarCheckbox.addEventListener('change', function () {
    settings.set('useSeparateTitlebar', this.checked)
    showRestartRequiredBanner()
  })
}

if (autoPlayCheckbox) {
  settings.get('enableAutoplay', function (value) {
    autoPlayCheckbox.checked = (value === true)
  })

  autoPlayCheckbox.addEventListener('change', function () {
    settings.set('enableAutoplay', this.checked)
  })
}

if (userAgentCheckbox && userAgentInput) {
  settings.get('customUserAgent', function (value) {
    if (value) {
      userAgentCheckbox.checked = true
      userAgentInput.style.display = 'block'
      userAgentInput.value = value
    } else {
      userAgentCheckbox.checked = false
      userAgentInput.style.display = 'none'
    }
  })

  userAgentCheckbox.addEventListener('change', function () {
    if (this.checked) {
      userAgentInput.style.display = 'block'
      userAgentInput.focus()
    } else {
      settings.set('customUserAgent', null)
      userAgentInput.style.display = 'none'
      userAgentInput.value = ''
      showRestartRequiredBanner()
    }
  })

  var userAgentTimeout = null
  userAgentInput.addEventListener('input', function () {
    clearTimeout(userAgentTimeout)
    var val = this.value
    userAgentTimeout = setTimeout(function () {
      if (val) {
        settings.set('customUserAgent', val)
      } else {
        settings.set('customUserAgent', null)
      }
      showRestartRequiredBanner()
    }, 500)
  })
}
