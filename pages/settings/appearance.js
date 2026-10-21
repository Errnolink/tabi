var siteThemeCheckbox = document.getElementById('checkbox-site-theme')

var darkModeNever = document.getElementById('dark-mode-never')
var darkModeNight = document.getElementById('dark-mode-night')
var darkModeAlways = document.getElementById('dark-mode-always')
var darkModeSystem = document.getElementById('dark-mode-system')

settings.get('darkMode', function (value) {
  if (darkModeNever) darkModeNever.checked = (value === -1)
  if (darkModeNight) darkModeNight.checked = (value === 0)
  if (darkModeAlways) darkModeAlways.checked = (value === 1 || value === true)
  if (darkModeSystem) darkModeSystem.checked = (value === 2 || value === undefined || value === false)
})

if (darkModeNever) {
  darkModeNever.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', -1)
  })
}
if (darkModeNight) {
  darkModeNight.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', 0)
  })
}
if (darkModeAlways) {
  darkModeAlways.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', 1)
  })
}
if (darkModeSystem) {
  darkModeSystem.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', 2)
  })
}

if (siteThemeCheckbox) {
  settings.get('siteTheme', function (value) {
    siteThemeCheckbox.checked = (value === true || value === undefined)
  })

  siteThemeCheckbox.addEventListener('change', function () {
    settings.set('siteTheme', this.checked)
  })
}
