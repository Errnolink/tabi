var settingsButton = document.getElementById('settings-button')
var settingsDropdown = document.getElementById('settings-dropdown')
var invertSection = document.getElementById('invert-pdf-section')
var invertCheckbox = document.getElementById('invert-pdf-checkbox')
var metaThemeElement = document.getElementById('meta-theme')
var themeSelectors = document.querySelectorAll('.theme-circle')

var metaThemeValues = {
  light: '#ffffff',
  dark: '#121318',
  sepia: '#f7ebd1'
}

settingsButton.addEventListener('click', function (e) {
  e.stopPropagation()
  settingsDropdown.hidden = !settingsDropdown.hidden
  if (settingsDropdown.hidden) {
    settingsButton.classList.remove('active')
  } else {
    settingsButton.classList.add('active')
    var zoomDropdown = document.getElementById('zoom-dropdown')
    if (zoomDropdown) {
      zoomDropdown.hidden = true
    }
  }
})

document.addEventListener('click', function (e) {
  if (!settingsDropdown.contains(e.target) && e.target !== settingsButton) {
    settingsDropdown.hidden = true
    settingsButton.classList.remove('active')
  }
})

function isNight () {
  var hours = new Date().getHours()
  return hours > 21 || hours < 6
}

themeSelectors.forEach(function (el) {
  el.addEventListener('click', function () {
    var theme = this.getAttribute('data-theme')
    if (isNight()) {
      settings.set('pdfNightTheme', theme)
    } else {
      settings.set('pdfDayTheme', theme)
    }
    setViewerTheme(theme)
  })
})

function setViewerTheme (theme) {
  themeSelectors.forEach(function (el) {
    if (el.getAttribute('data-theme') === theme) {
      el.classList.add('selected')
    } else {
      el.classList.remove('selected')
    }
  })

  if (metaThemeElement && metaThemeValues[theme]) {
    metaThemeElement.content = metaThemeValues[theme]
  }

  document.body.setAttribute('theme', theme)
  document.body.classList.toggle('dark-mode', theme === 'dark')
  document.body.classList.toggle('light-mode', theme === 'light')

  if (invertSection) {
    invertSection.hidden = !(theme === 'dark')
  }

  setTimeout(function () {
    document.body.classList.add('theme-loaded')
  }, 16)
}

function initializeViewerTheme () {
  settings.get('darkMode', function (globalDarkModeEnabled) {
    settings.get('pdfDayTheme', function (pdfDayTheme) {
      settings.get('pdfNightTheme', function (pdfNightTheme) {
        if (isNight() && pdfNightTheme) {
          setViewerTheme(pdfNightTheme)
        } else if (!isNight() && pdfDayTheme) {
          setViewerTheme(pdfDayTheme)
        } else if (globalDarkModeEnabled === 1 || globalDarkModeEnabled === true || isNight()) {
          setViewerTheme('dark')
        } else {
          setViewerTheme('light')
        }
      })
    })
  })
}

initializeViewerTheme()

settings.get('PDFInvertColors', function (value) {
  if (invertCheckbox) {
    invertCheckbox.checked = (value === true)
  }
  document.body.setAttribute('data-invert', value || false)
})

if (invertCheckbox) {
  invertCheckbox.addEventListener('click', function () {
    settings.set('PDFInvertColors', this.checked)
    document.body.setAttribute('data-invert', this.checked)
  })
}
