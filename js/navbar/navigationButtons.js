const webviews = require('webviews.js')

const navigationButtons = {
  container: document.getElementById('toolbar-navigation-buttons'),
  backButton: document.getElementById('back-button'),
  forwardButton: document.getElementById('forward-button'),
  reloadButton: document.getElementById('reload-button'),
  isLoading: false,
  setLoading: function (loading) {
    navigationButtons.isLoading = loading
    navigationButtons.reloadButton.classList.toggle('carbon:close', loading)
    navigationButtons.reloadButton.classList.toggle('carbon:renew', !loading)
    navigationButtons.reloadButton.classList.toggle('is-loading', loading)
    navigationButtons.reloadButton.title = loading ? 'Stop' : 'Reload'
  },
  update: function () {
    const selectedId = tabs.getSelected()
    if (!selectedId || !tabs.get(selectedId) || !tabs.get(selectedId).url) {
      navigationButtons.backButton.disabled = true
      navigationButtons.forwardButton.disabled = true
      return
    }
    webviews.callAsync(selectedId, 'canGoBack', function (err, canGoBack) {
      if (err) {
        return
      }
      navigationButtons.backButton.disabled = !canGoBack
    })
    webviews.callAsync(selectedId, 'canGoForward', function (err, canGoForward) {
      if (err) {
        return
      }
      navigationButtons.forwardButton.disabled = !canGoForward
      if (canGoForward) {
        navigationButtons.container.classList.add('can-go-forward')
      } else {
        navigationButtons.container.classList.remove('can-go-forward')
      }
    })
  },
  initialize: function () {
    navigationButtons.container.hidden = false

    navigationButtons.backButton.addEventListener('click', function () {
      const selectedId = tabs.getSelected()
      if (selectedId) {
        webviews.goBackIgnoringRedirects(selectedId)
      }
    })

    navigationButtons.forwardButton.addEventListener('click', function () {
      const selectedId = tabs.getSelected()
      if (selectedId) {
        webviews.callAsync(selectedId, 'goForward')
      }
    })

    navigationButtons.reloadButton.addEventListener('click', function () {
      const selectedId = tabs.getSelected()
      if (!selectedId) {
        return
      }
      webviews.callAsync(selectedId, navigationButtons.isLoading ? 'stop' : 'reload')
    })

    function syncLoading () {
      navigationButtons.setLoading(webviews.isLoading(tabs.getSelected()))
    }

    webviews.bindEvent('did-start-loading', syncLoading)
    webviews.bindEvent('did-stop-loading', syncLoading)

    tasks.on('tab-selected', function () {
      navigationButtons.update()
      syncLoading()
    })

    webviews.bindEvent('did-navigate', navigationButtons.update)
    webviews.bindEvent('did-navigate-in-page', navigationButtons.update)
  }
}

module.exports = navigationButtons
