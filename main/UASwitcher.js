/* Use the same user agent as Chrome to improve site compatibility and increase fingerprinting resistance
see https://github.com/minbrowser/min/issues/657 for more information */

const defaultUserAgent = app.userAgentFallback
let hasCustomUserAgent = false
let newUserAgent

const hiddenAppTokens = [...new Set([app.getName(), 'Tabi', 'xb', 'Min', 'Electron'])]

if (settings.get('customUserAgent')) {
  newUserAgent = settings.get('customUserAgent')
  hasCustomUserAgent = true
} else {
  newUserAgent = defaultUserAgent.split(' ').filter(function (token) {
    return !hiddenAppTokens.some(function (name) {
      return token.startsWith(name + '/')
    })
  }).join(' ')
  newUserAgent = newUserAgent.replace(process.versions.chrome, process.versions.chrome.split('.').map((v, idx) => (idx === 0) ? v : '0').join('.'))
}
app.userAgentFallback = newUserAgent

function getFirefoxUA () {
  const rootUAs = {
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:FXVERSION.0) Gecko/20100101 Firefox/FXVERSION.0',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:FXVERSION.0) Gecko/20100101 Firefox/FXVERSION.0',
    linux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:FXVERSION.0) Gecko/20100101 Firefox/FXVERSION.0'
  }

  let rootUA
  if (process.platform === 'win32') {
    rootUA = rootUAs.windows
  } else if (process.platform === 'darwin') {
    rootUA = rootUAs.mac
  } else {
    rootUA = rootUAs.linux
  }

  const fxVersion = 91 + Math.floor((Date.now() - 1628553600000) / (4.1 * 7 * 24 * 60 * 60 * 1000))

  return rootUA.replace(/FXVERSION/g, fxVersion)
}

const googleFirefoxUA = getFirefoxUA()

function isGoogleAccountsUrl (url) {
  try {
    return new URL(url).hostname === 'accounts.google.com'
  } catch (err) {
    return false
  }
}

function getPersonaUserAgentForUrl (url) {
  if (hasCustomUserAgent || typeof url !== 'string') return undefined
  return isGoogleAccountsUrl(url) ? googleFirefoxUA : newUserAgent
}

const uaPersonaPageScript = "if (location.hostname === 'accounts.google.com') { try { delete Navigator.prototype.userAgentData } catch (e) {} ; try { Object.defineProperty(Navigator.prototype, 'vendor', { get: function () { return '' } }) } catch (e) {} ; try { delete window.chrome } catch (e) {} ; try { Object.defineProperty(window, 'chrome', { value: undefined, writable: false, configurable: false }) } catch (e) {} }"
const uaPersonaPreloadSource = "const { webFrame } = require('electron')\nwebFrame.executeJavaScript(" + JSON.stringify(uaPersonaPageScript) + ')'

function registerUAPersonaPreload (ses) {
  if (hasCustomUserAgent) return
  const fs = require('fs')
  const path = require('path')
  const preloadPath = path.join(app.getPath('userData'), 'ua-persona-preload.js')
  let needsWrite = true
  try {
    needsWrite = fs.readFileSync(preloadPath, 'utf8') !== uaPersonaPreloadSource
  } catch (err) { }
  if (needsWrite) {
    try {
      fs.writeFileSync(preloadPath, uaPersonaPreloadSource)
    } catch (err) {
      console.warn('failed to write UA persona preload:', err)
    }
  }
  try {
    ses.unregisterPreloadScript('tabi-ua-persona')
  } catch (err) { }
  try {
    ses.registerPreloadScript({ id: 'tabi-ua-persona', type: 'frame', filePath: preloadPath })
  } catch (err) {
    console.warn('UA persona preload registration failed:', err)
  }
}

function enableGoogleUASwitcher (ses) {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!hasCustomUserAgent && details.url.includes('accounts.google.com')) {
      const url = new URL(details.url)

      if (url.hostname === 'accounts.google.com') {
        details.requestHeaders['User-Agent'] = googleFirefoxUA
        for (const header of Object.keys(details.requestHeaders)) {
          if (header.toLowerCase().startsWith('sec-ch-ua')) {
            delete details.requestHeaders[header]
          }
        }
      }
    }

    callback({ cancel: false, requestHeaders: details.requestHeaders })
  })
}

if (!hasCustomUserAgent) {
  app.on('web-contents-created', function (e, contents) {
    let usingFirefox = false

    function syncPersona (url, isMainFrame) {
      if (!isMainFrame || typeof url !== 'string') return
      const want = isGoogleAccountsUrl(url)
      if (want !== usingFirefox) {
        usingFirefox = want
        contents.setUserAgent(want ? googleFirefoxUA : newUserAgent)
      }
    }

    contents.on('will-navigate', function (e2, url) {
      syncPersona(url, true)
    })
    contents.on('did-start-navigation', function (e2, url, isInPlace, isMainFrame) {
      syncPersona(url, isMainFrame)
    })
  })
}

app.once('ready', function () {
  enableGoogleUASwitcher(session.defaultSession)
  registerUAPersonaPreload(session.defaultSession)
})

app.on('session-created', function (ses) {
  enableGoogleUASwitcher(ses)
  registerUAPersonaPreload(ses)
})
