const searchbar = require('searchbar/searchbar.js')
const webviews = require('webviews.js')
const modalMode = require('modalMode.js')
const urlParser = require('util/urlParser.js')
const keyboardNavigationHelper = require('util/keyboardNavigationHelper.js')
const bookmarkStar = require('navbar/bookmarkStar.js')
const contentBlockingToggle = require('navbar/contentBlockingToggle.js')

const tabEditor = {
  container: document.getElementById('tab-editor'),
  input: document.getElementById('tab-editor-input'),
  star: null,
  contentBlockingToggle: null,
  isShown: false,
  updateDisplay: function (tabId = tabs.getSelected()) {
    if (tabEditor.isShown) {
      return
    }
    if (!tabId || tabs.isEmpty()) {
      tabEditor.input.value = ''
      return
    }
    const tab = tabs.get(tabId)
    if (!tab || !tab.url || tab.url === '' || tab.url === urlParser.parse('min://newtab')) {
      tabEditor.input.value = ''
    } else {
      tabEditor.input.value = urlParser.getSourceURL(tab.url)
    }
  },
  show: function (tabId = tabs.getSelected(), editingValue, showSearchbar) {
    if (modalMode.enabled()) {
      return
    }
    if (!tabId) {
      return
    }

    tabEditor.isShown = true
    tabEditor.container.classList.add('is-editing')

    bookmarkStar.update(tabId, tabEditor.star)
    contentBlockingToggle.update(tabId, tabEditor.contentBlockingToggle)

    webviews.requestPlaceholder('editMode')
    document.body.classList.add('is-edit-mode')

    const tabData = tabs.get(tabId)
    let currentURL = ''
    if (tabData && tabData.url) {
      currentURL = urlParser.getSourceURL(tabData.url)
      if (currentURL === 'min://newtab') {
        currentURL = ''
      }
    }

    tabEditor.input.value = editingValue !== undefined && editingValue !== null ? editingValue : currentURL
    tabEditor.input.focus()
    if (!editingValue) {
      tabEditor.input.select()
    }
    tabEditor.input.scrollLeft = 0

    searchbar.show(tabEditor.input)

    if (showSearchbar !== false) {
      if (editingValue) {
        searchbar.showResults(editingValue, null)
      } else {
        searchbar.showResults('', null)
      }
    }
  },
  hide: function () {
    tabEditor.isShown = false
    tabEditor.container.classList.remove('is-editing')

    tabEditor.input.blur()
    searchbar.hide()

    document.body.classList.remove('is-edit-mode')
    webviews.hidePlaceholder('editMode')

    tabEditor.updateDisplay()
  },
  initialize: function () {
    tabEditor.input.setAttribute('placeholder', l('searchbarPlaceholder'))

    tabEditor.star = bookmarkStar.create()
    tabEditor.container.appendChild(tabEditor.star)

    tabEditor.contentBlockingToggle = contentBlockingToggle.create()
    tabEditor.container.appendChild(tabEditor.contentBlockingToggle)

    keyboardNavigationHelper.addToGroup('searchbar', tabEditor.container)

    const progress = tabEditor.container.querySelector('.omnibox-progress')
    function syncProgress () {
      progress.hidden = !webviews.isLoading(tabs.getSelected())
    }

    webviews.bindEvent('did-start-loading', syncProgress)
    webviews.bindEvent('did-stop-loading', syncProgress)

    tasks.on('tab-selected', function (id) {
      tabEditor.updateDisplay(id)
      syncProgress()
    })

    tasks.on('tab-updated', function (id, key) {
      if (id === tabs.getSelected() && (key === 'url' || key === 'title')) {
        tabEditor.updateDisplay(id)
      }
    })

    tabEditor.container.addEventListener('click', function (e) {
      if (!tabEditor.isShown && tabs.getSelected()) {
        tabEditor.show(tabs.getSelected())
      }
    })

    tabEditor.input.addEventListener('input', function (e) {
      if (e.isComposing) {
        return
      }
      searchbar.showResults(this.value, {
        isDeletion: e.inputType ? e.inputType.includes('delete') : false
      })
    })

    tabEditor.input.addEventListener('compositionend', function (e) {
      searchbar.showResults(this.value)
    })

    tabEditor.input.addEventListener('keypress', function (e) {
      if (e.keyCode === 13) {
        if (this.getAttribute('data-autocomplete-text') && this.getAttribute('data-autocomplete-text').toLowerCase() === this.value.toLowerCase()) {
          searchbar.openURL(this.getAttribute('data-autocomplete-ref') || this.getAttribute('data-autocomplete-text'), e)
        } else {
          searchbar.openURL(this.value, e)
        }
        e.preventDefault()
      }

      if (e.key && this.selectionEnd === this.value.length && this.value[this.selectionStart] === e.key) {
        this.selectionStart += 1
        e.preventDefault()
        searchbar.showResults(this.value.substring(0, this.selectionStart), {})
      }
    })

    const webviewsEl = document.getElementById('webviews')
    if (webviewsEl) {
      webviewsEl.addEventListener('click', function () {
        tabEditor.hide()
      })
    }

    const sidebarEl = document.getElementById('sidebar')
    if (sidebarEl) {
      sidebarEl.addEventListener('click', function () {
        tabEditor.hide()
      })
    }
  }
}

tabEditor.initialize()

module.exports = tabEditor
