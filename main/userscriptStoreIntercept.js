/* Navigation interception: .user.js navigations in non-default sessions are
   redirected to the install prompt instead of rendering the raw source. */

function isUserScriptURL (url) {
  return /^(https?|file):\/\//i.test(url) && /\.user\.js([?#]|$)/i.test(url)
}

function userscriptInstallPageURL (sourceURL) {
  return 'min://app/pages/userscripts/install.html?src=' + encodeURIComponent(sourceURL)
}

var userscriptStorePromptLoads = new WeakMap()

function userscriptStoreOpenPrompt (contents, sourceURL) {
  if (userscriptStorePromptLoads.get(contents) === sourceURL) {
    return
  }
  userscriptStorePromptLoads.set(contents, sourceURL)
  setImmediate(function () {
    if (contents.isDestroyed()) {
      return
    }
    contents.loadURL(userscriptInstallPageURL(sourceURL)).catch(function () { }).finally(function () {
      if (userscriptStorePromptLoads.get(contents) === sourceURL) {
        userscriptStorePromptLoads.delete(contents)
      }
    })
  })
}

app.on('web-contents-created', function (e, contents) {
  function intercept (url, cancel) {
    if (!isUserScriptURL(url)) {
      return false
    }
    if (contents.session === session.defaultSession) {
      return false
    }
    var currentURL = ''
    try {
      currentURL = contents.getURL()
    } catch (err) { }
    if (currentURL.startsWith('min://')) {
      return false
    }
    if (cancel) {
      return 'cancel'
    }
    return 'redirect'
  }
  contents.on('will-navigate', function (e, url) {
    if (intercept(url, true) !== 'cancel') {
      return
    }
    e.preventDefault()
    userscriptStoreOpenPrompt(contents, url)
  })
  contents.on('did-start-navigation', function (e, url, isInPlace, isMainFrame) {
    if (!isMainFrame) {
      return
    }
    if (intercept(url, false) !== 'redirect') {
      return
    }
    userscriptStoreOpenPrompt(contents, url)
  })

  /* the typed-URL path commits the .user.js entry before the redirect; drop it
     from history so going back from the install prompt skips the raw source */
  contents.on('did-navigate', function (e, url) {
    if (intercept(url, false) === 'redirect') {
      userscriptStoreOpenPrompt(contents, url)
    }
    var match = /^min:\/\/app\/pages\/userscripts\/install\.html\?src=(.+)$/.exec(url)
    if (!match || contents.session === session.defaultSession) {
      return
    }
    var sourceURL
    try {
      sourceURL = decodeURIComponent(match[1])
    } catch (err) {
      return
    }
    var history = contents.navigationHistory
    for (var i = 0; i < history.length(); i++) {
      if (i === history.getActiveIndex()) {
        continue
      }
      try {
        if (history.getEntryAtIndex(i).url === sourceURL) {
          history.removeEntryAtIndex(i)
          break
        }
      } catch (err) { }
    }
  })
})

app.whenReady().then(function () {
  try {
    fs.mkdirSync(userscriptStoreDir, { recursive: true })
  } catch (e) { }
  if (settings.get('userscriptsEnabled') === undefined) {
    settings.set('userscriptsEnabled', true)
  }
  userscriptStoreLoadCache()
  setTimeout(userscriptStoreAutoUpdateSweep, 60000)
  setInterval(userscriptStoreAutoUpdateSweep, 6 * 60 * 60 * 1000)
})

app.on('before-quit', function () {
  gmFlushAllValuesSync()
})
