const webviews = require('webviews.js')

const navigationButtons = {
  container: document.getElementById('toolbar-navigation-buttons'),
  backButton: document.getElementById('back-button'),
  forwardButton: document.getElementById('forward-button'),
  reloadButton: document.getElementById('reload-button'),
  isLoading: false,
  setLoading: function (loading) {
    navigationButtons.isLoading = loading
    if (!navigationButtons.reloadButton) {
      return
    }
    if (loading) {
      navigationButtons.reloadButton.className = 'navbar-action-button i carbon:close'
      navigationButtons.reloadButton.title = 'Stop'
    } else {
      navigationButtons.reloadButton.className = 'navbar-action-button i carbon:renew'
      navigationButtons.reloadButton.title = 'Reload'
    }
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

    if (navigationButtons.reloadButton) {
      navigationButtons.reloadButton.addEventListener('click', function () {
        const selectedId = tabs.getSelected()
        if (!selectedId) {
          return
        }
        if (navigationButtons.isLoading) {
          webviews.callAsync(selectedId, 'stop')
        } else {
          webviews.callAsync(selectedId, 'reload')
        }
      })
    }

    webviews.bindEvent('did-start-loading', function (tabId) {
      if (tabId === tabs.getSelected()) {
        navigationButtons.setLoading(true)
      }
    })

    webviews.bindEvent('did-stop-loading', function (tabId) {
      if (tabId === tabs.getSelected()) {
        navigationButtons.setLoading(false)
      }
    })

    tasks.on('tab-selected', function (tabId) {
      navigationButtons.update()
      const tab = tabs.get(tabId)
      navigationButtons.setLoading(tab ? tab.loaded === false : false)
    })

    webviews.bindEvent('did-navigate', navigationButtons.update)
    webviews.bindEvent('did-navigate-in-page', navigationButtons.update)
  }
}

module.exports = navigationButtons
