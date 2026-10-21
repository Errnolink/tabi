const webviews = require('webviews.js')
const settings = require('util/settings/settings.js')
const remoteMenu = require('remoteMenuRenderer.js')

const contentBlockingToggle = {
  blockingDisabledGlobally: function () {
    var setting = settings.get('filtering')
    return !!(setting && setting.blockingLevel === 0)
  },
  enableBlocking: function (url) {
    if (!url) {
      return
    }
    var domain = new URL(url).hostname

    var setting = settings.get('filtering')
    var domains = ((setting && setting.exceptionDomains) || []).slice()
    domains = domains.filter(d => d.replace(/^www\./g, '') !== domain.replace(/^www\./g, ''))
    settings.merge('filtering', { exceptionDomains: domains })
    webviews.callAsync(tabs.getSelected(), 'reload')
  },
  disableBlocking: function (url) {
    if (!url) {
      return
    }
    var domain = new URL(url).hostname

    var setting = settings.get('filtering')
    var domains = ((setting && setting.exceptionDomains) || []).slice()
    // make sure the domain isn't already an exception
    if (!domains.some(d => d.replace(/^www\./g, '') === domain.replace(/^www\./g, ''))) {
      domains.push(domain)
    }
    settings.merge('filtering', { exceptionDomains: domains })
    webviews.callAsync(tabs.getSelected(), 'reload')
  },
  isBlockingEnabled: function (url) {
    if (contentBlockingToggle.blockingDisabledGlobally()) {
      return false
    }
    try {
      var domain = new URL(url).hostname
    } catch (e) {
      return false
    }

    var setting = settings.get('filtering')
    return !setting || !setting.exceptionDomains || !setting.exceptionDomains.some(d => d.replace(/^www\./g, '') === domain.replace(/^www\./g, ''))
  },
  create: function () {
    const button = document.createElement('button')
    button.className = 'tab-editor-button i carbon:manage-protection'
    button.title = 'Ad and tracker blocking for this site'
    button.setAttribute('aria-label', 'Ad and tracker blocking for this site')
    button.addEventListener('click', function (e) {
      contentBlockingToggle.showMenu(button)
    })

    return button
  },
  showMenu: function (button) {
    var url = tabs.get(tabs.getSelected()).url
    var globallyOff = contentBlockingToggle.blockingDisabledGlobally()
    var menu = [
      [
        {
          type: 'checkbox',
          label: globallyOff ? l('blockingOffGlobally') : l('enableBlocking'),
          enabled: !globallyOff,
          checked: contentBlockingToggle.isBlockingEnabled(url),
          click: function () {
            if (contentBlockingToggle.isBlockingEnabled(url)) {
              contentBlockingToggle.disableBlocking(url)
            } else {
              contentBlockingToggle.enableBlocking(url)
            }
            contentBlockingToggle.update(tabs.getSelected(), button)
          }
        }
      ],
      [
        {
          label: l('appMenuReportBug'),
          click: function () {
            var newTab = tabs.add({ url: 'https://github.com/minbrowser/min/issues/new?title=Content%20blocking%20issue%20on%20' + encodeURIComponent(url) })
            require('browserUI.js').addTab(newTab, { enterEditMode: false })
          }
        }
      ]
    ]
    remoteMenu.open(menu)
  },
  update: function (tabId, button) {
    if (!tabs.get(tabId).url.startsWith('http') && !tabs.get(tabId).url.startsWith('https')) {
      button.hidden = true
      return
    }

    if (settings.get('filtering') && settings.get('filtering').blockingLevel === 0) {
      button.hidden = true
      return
    }

    button.hidden = false
    if (contentBlockingToggle.isBlockingEnabled(tabs.get(tabId).url)) {
      button.style.opacity = 1
    } else {
      button.style.opacity = 0.4
    }
  }
}

module.exports = contentBlockingToggle
