const clipboard = electron.clipboard

const webviews = require('webviews.js')
const browserUI = require('browserUI.js')
const searchEngine = require('util/searchEngine.js')
const userscripts = require('userscripts.js')
const settings = require('util/settings/settings.js')
const pageTranslations = require('pageTranslations.js')
const PasswordManagers = require('passwordManager/passwordManager.js')

const remoteMenu = require('remoteMenuRenderer.js')
const containers = require('containers.js')

const webviewMenu = {
  menuData: null,
  showMenu: function (data, extraData) { // data comes from a context-menu event
    var currentTab = tabs.get(tabs.getSelected())

    var menuSections = []

    const openInBackground = !settings.get('openTabsInForeground')

    /* Picture in Picture */

    if (extraData.hasVideo) {
      menuSections.push([
        {
          label: l('pictureInPicture'),
          click: function () {
            webviews.callAsync(tabs.getSelected(), 'send', ['enterPictureInPicture', { x: data.x, y: data.y }])
          }
        }
      ])
    }

    /* Spellcheck */

    if (data.misspelledWord) {
      var suggestionEntries = data.dictionarySuggestions.slice(0, 3).map(function (suggestion) {
        return {
          label: suggestion,
          click: function () {
            webviews.callAsync(tabs.getSelected(), 'replaceMisspelling', suggestion)
          }
        }
      })

      // https://www.electronjs.org/docs/api/session#sesaddwordtospellcheckerdictionaryword
      // "This API will not work on non-persistent (in-memory) sessions"
      if (!currentTab.private) {
        suggestionEntries.push({
          label: l('addToDictionary'),
          click: function () {
            ipc.invoke('addWordToSpellCheckerDictionary', data.misspelledWord)
          }
        })
      }

      if (suggestionEntries.length > 0) {
        menuSections.push(suggestionEntries)
      }
    }

    /* links */

    var link = data.linkURL

    // show link items for embedded frames, but not the top-level page (which will also be listed as a frameURL)
    if (!link && data.frameURL && data.frameURL !== currentTab.url) {
      link = data.frameURL
    }

    if (link === 'about:srcdoc') {
      /* srcdoc is used in reader view, but it can't actually be opened anywhere outside of the reader page */
      link = null
    }

    if (link) {
      var linkActions = [
        {
          label: (link.length > 60) ? link.substring(0, 60) + '...' : link,
          enabled: false
        }
      ]

      if (!currentTab.private) {
        linkActions.push({
          label: l('openInNewTab'),
          click: function () {
            browserUI.addTab(tabs.add({ url: link, containerId: currentTab.containerId }), { enterEditMode: false, openInBackground: openInBackground })
          }
        })
      }

      linkActions.push({
        label: l('openInNewPrivateTab'),
        click: function () {
          browserUI.addTab(tabs.add({ url: link, private: true }), { enterEditMode: false, openInBackground: openInBackground })
        }
      })

      linkActions.push({
        label: l('openInContainer'),
        submenu: containers.list().map(function (container) {
          return {
            label: container.name,
            click: function () {
              browserUI.addTab(tabs.add({ url: link, containerId: container.id }), { enterEditMode: false, openInBackground: openInBackground })
            }
          }
        })
      })

      linkActions.push({
        label: l('saveLinkAs'),
        click: function () {
          webviews.callAsync(tabs.getSelected(), 'downloadURL', [link])
        }
      })

      var emailMatch = link.startsWith('mailto:') && link.match(/(?<=mailto:)[^?]+/)
      if (emailMatch) {
        linkActions.push({
          label: l('copyEmailAddress'),
          click: function () {
            clipboard.writeText(emailMatch[0])
          }
        })
      } else {
        linkActions.push({
          label: l('copyLinkAddress'),
          click: function () {
            clipboard.writeText(link)
          }
        })
      }

      menuSections.push(linkActions)
    }

    /* images */

    var mediaURL = data.srcURL

    if (mediaURL && data.mediaType === 'image') {
      var imageActions = [
        {
          label: (mediaURL.length > 60) ? mediaURL.substring(0, 60) + '...' : mediaURL,
          enabled: false
        }
      ]

      imageActions.push({
        label: l('viewImage'),
        click: function () {
          webviews.update(tabs.getSelected(), mediaURL)
        }
      })

      if (!currentTab.private) {
        imageActions.push({
          label: l('openImageInNewTab'),
          click: function () {
            browserUI.addTab(tabs.add({ url: mediaURL, containerId: currentTab.containerId }), { enterEditMode: false, openInBackground: openInBackground })
          }
        })
      }

      imageActions.push({
        label: l('openImageInNewPrivateTab'),
        click: function () {
          browserUI.addTab(tabs.add({ url: mediaURL, private: true }), { enterEditMode: false, openInBackground: openInBackground })
        }
      })

      imageActions.push({
        label: l('saveImageAs'),
        click: function () {
          webviews.callAsync(tabs.getSelected(), 'downloadURL', [mediaURL])
        }
      })

      imageActions.push({
        label: l('copyImage'),
        click: function () {
          webviews.callAsync(tabs.getSelected(), 'copyImageAt', [data.x, data.y])
        }
      })

      if (!mediaURL.startsWith('blob:') && !mediaURL.startsWith('data:')) {
        imageActions.push({
          label: l('copyImageAddress'),
          click: function () {
            clipboard.writeText(mediaURL)
          }
        })
      }

      menuSections.push(imageActions)
    }

    var editFlags = data.editFlags || {}
    var isEditable = !!data.isEditable
    var selection = data.selectionText

    if (isEditable) {
      menuSections.push([
        { label: l('undo'), accelerator: 'Ctrl+Z', enabled: !!editFlags.canUndo, role: 'undo' },
        { label: l('redo'), accelerator: 'Ctrl+Shift+Z', enabled: !!editFlags.canRedo, role: 'redo' }
      ])
      menuSections.push([
        { label: l('cut'), accelerator: 'Ctrl+X', enabled: !!editFlags.canCut, role: 'cut' },
        { label: l('copy'), accelerator: 'Ctrl+C', enabled: !!editFlags.canCopy, role: 'copy' },
        { label: l('paste'), accelerator: 'Ctrl+V', enabled: !!editFlags.canPaste, role: 'paste' },
        { label: l('pasteAndMatchStyle'), accelerator: 'Ctrl+Shift+V', enabled: !!editFlags.canPaste, role: 'pasteAndMatchStyle' },
        { label: l('selectAll'), accelerator: 'Ctrl+A', enabled: !!editFlags.canSelectAll, role: 'selectAll' }
      ])
    } else if (selection) {
      menuSections.push([
        {
          label: l('copy'),
          accelerator: 'Ctrl+C',
          click: function () {
            webviews.callAsync(tabs.getSelected(), 'copy')
          }
        }
      ])
    }

    if (selection) {
      var shortSelection = selection.trim().replace(/\s+/g, ' ')
      if (shortSelection.length > 24) {
        shortSelection = shortSelection.substring(0, 24) + '…'
      }
      menuSections.push([
        {
          label: l('searchWith').replace('%s', searchEngine.getCurrent().name) + ' “' + shortSelection + '”',
          click: function () {
            var newTab = tabs.add({
              url: searchEngine.getCurrent().searchURL.replace('%s', encodeURIComponent(selection)),
              private: currentTab.private,
              containerId: currentTab.containerId
            })
            browserUI.addTab(newTab, {
              enterEditMode: false,
              openInBackground: false
            })
          }
        }
      ])
    }

    if (data.formControlType === 'input-password' && PasswordManagers.getActivePasswordManager()?.saveCredential) {
      menuSections.push([
        {
          label: l('generatePassword'),
          click: function () {
            webviews.callAsync(tabs.getSelected(), 'send', ['generate-password', { x: data.x, y: data.y }])
          }
        }
      ])
    }

    const pageURL = currentTab.url
    const isWebPage = /^https?:/.test(pageURL)
    const isPageContext = !link && !(mediaURL && data.mediaType === 'image') && !selection && !isEditable

    if (isPageContext) {
      const navigationButtons = require('navbar/navigationButtons.js')
      menuSections.push([
        {
          label: l('goBack'),
          accelerator: 'Alt+Left',
          enabled: !navigationButtons.backButton.disabled,
          click: function () {
            webviews.goBackIgnoringRedirects(tabs.getSelected())
          }
        },
        {
          label: l('goForward'),
          accelerator: 'Alt+Right',
          enabled: !navigationButtons.forwardButton.disabled,
          click: function () {
            webviews.callAsync(tabs.getSelected(), 'goForward')
          }
        },
        {
          label: l('tabMenuReload'),
          accelerator: 'Ctrl+R',
          click: () => require('tabActions.js').reload(tabs.getSelected())
        }
      ])

      menuSections.push([
        {
          label: l('appMenuSavePageAs'),
          accelerator: 'Ctrl+S',
          click: () => ipc.emit('saveCurrentPage', {})
        },
        {
          label: l('appMenuPrint'),
          accelerator: 'Ctrl+P',
          click: () => ipc.emit('print', {})
        },
        {
          label: l('tabMenuCopyLink'),
          enabled: isWebPage,
          click: () => clipboard.writeText(pageURL)
        }
      ])
    }

    var devActions = []
    if (isPageContext) {
      devActions.push({
        label: l('viewPageSource'),
        enabled: isWebPage,
        click: () => {
          browserUI.addTab(tabs.add({ url: 'view-source:' + pageURL, containerId: currentTab.containerId, private: currentTab.private }), { enterEditMode: false })
        }
      })
    }
    devActions.push({
      label: l('inspectElement'),
      click: function () {
        webviews.callAsync(tabs.getSelected(), 'inspectElement', [data.x || 0, data.y || 0])
      }
    })

    /* Userscripts */

    var contextMenuScripts = userscripts.getMatchingScripts(tabs.get(tabs.getSelected()).url).filter(function (script) {
      if (script.options['run-at'] && script.options['run-at'].includes('context-menu')) {
        return true
      }
    })

    if (contextMenuScripts.length > 0) {
      var scriptActions = [
        {
          label: l('runUserscript'),
          enabled: false
        }
      ]
      contextMenuScripts.forEach(function (script) {
        scriptActions.push({
          label: script.name,
          click: function () {
            userscripts.runScript(tabs.getSelected(), script)
          }
        })
      })
      menuSections.push(scriptActions)
    }

    var translateMenu = {
      label: l('translatePage'),
      submenu: []
    }

    const translateLangList = pageTranslations.getLanguageList()

    translateLangList[0].forEach(function (language) {
      translateMenu.submenu.push({
        label: language.name,
        click: function () {
          pageTranslations.translateInto(tabs.getSelected(), language.code)
        }
      })
    })

    if (translateLangList[1].length > 0) {
      translateMenu.submenu.push({
        type: 'separator'
      })
      translateLangList[1].forEach(function (language) {
        translateMenu.submenu.push({
          label: language.name,
          click: function () {
            pageTranslations.translateInto(tabs.getSelected(), language.code)
          }
        })
      })
    }

    translateMenu.submenu.push({
      type: 'separator'
    })

    translateMenu.submenu.push({
      label: 'Send Feedback',
      click: function () {
        browserUI.addTab(tabs.add({ url: 'https://github.com/minbrowser/min/issues/new?title=Translation%20feedback%20for%20' + encodeURIComponent(tabs.get(tabs.getSelected()).url) }), { enterEditMode: false, openInBackground: false })
      }
    })

    if (isPageContext) {
      menuSections.push([translateMenu])
    }
    menuSections.push(devActions)

    // Electron's default menu position is sometimes wrong on Windows with a touchscreen
    // https://github.com/minbrowser/min/issues/903
    var offset = webviews.getViewBounds()
    remoteMenu.open(menuSections, data.x + offset.x, data.y + offset.y, { tabId: tabs.getSelected(), contextMenuParams: data })
  },
  initialize: function () {
    webviews.bindEvent('context-menu', function (tabId, data) {
      webviewMenu.menuData = data
      webviews.callAsync(tabs.getSelected(), 'send', ['getContextMenuData', { x: data.x, y: data.y }])
    })
    webviews.bindIPC('contextMenuData', function (tabId, args) {
      webviewMenu.showMenu(webviewMenu.menuData, args[0])
      webviewMenu.menuData = null
    })
  }
}

module.exports = webviewMenu
