const tabEditor = require('navbar/tabEditor.js')

module.exports = function (newTabPage) {
  function buildSection (page) {
    const searchBox = document.createElement('div')
    searchBox.className = 'ntp-search-box'
    searchBox.tabIndex = 0

    const searchIcon = document.createElement('i')
    searchIcon.className = 'i carbon:search ntp-search-icon'

    const searchPlaceholder = document.createElement('span')
    searchPlaceholder.className = 'ntp-search-placeholder'
    searchPlaceholder.textContent = l('searchbarPlaceholder') || 'Search or enter address'

    searchBox.appendChild(searchIcon)
    searchBox.appendChild(searchPlaceholder)

    searchBox.addEventListener('click', function () {
      if (window.tabs && tabs.getSelected()) {
        tabEditor.show(tabs.getSelected())
      }
    })

    searchBox.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') return
      e.preventDefault()
      if (window.tabs && tabs.getSelected()) {
        const val = e.key.length === 1 ? e.key : ''
        tabEditor.show(tabs.getSelected(), val)
      }
    })

    page.mainEl.appendChild(searchBox)
  }

  return {
    buildSection
  }
}
