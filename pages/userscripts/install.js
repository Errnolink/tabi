document.title = l('userscriptInstallPageTitle') + ' | Tabi'

const PAGE_PREFIX = 'userscriptsPage:'

let requestCounter = 0
const pendingRequests = {}

function storeRequest (op, args) {
  return new Promise(function (resolve, reject) {
    requestCounter++
    pendingRequests[requestCounter] = { resolve, reject }
    window.postMessage({ message: PAGE_PREFIX + op, id: requestCounter, args: args }, window.location.toString())
    setTimeout(function () {
      if (pendingRequests[requestCounter]) {
        pendingRequests[requestCounter].reject(new Error('timeout'))
        delete pendingRequests[requestCounter]
      }
    }, 60000)
  })
}

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }
  if (e.data.message === PAGE_PREFIX + 'result') {
    var request = pendingRequests[e.data.id]
    if (request) {
      delete pendingRequests[e.data.id]
      if (e.data.error) {
        request.reject(new Error(e.data.error))
      } else {
        request.resolve(e.data.result)
      }
    }
  }
})

function showView (id) {
  ;['install-view', 'error-view', 'success-view', 'loading-view'].forEach(function (view) {
    document.getElementById(view).hidden = view !== id
  })
}

function fieldVisible (id, visible) {
  document.getElementById(id).hidden = !visible
}

let currentSource = ''
let currentSourceURL = ''

function grantedLabels (grants) {
  const names = []
  ;(grants || []).forEach(function (grant) {
    const raw = String(grant).trim()
    if (!userscriptMeta.GRANT_ALIASES[raw] || names.includes(raw)) {
      return
    }
    names.push(raw)
  })
  return names
}

function showError (message) {
  document.getElementById('error-text').textContent = message
  showView('error-view')
}

function fillPatternList (fieldId, listId, patterns) {
  const box = document.getElementById(listId)
  box.textContent = ''
  fieldVisible(fieldId, patterns.length > 0)
  patterns.forEach(function (pattern) {
    const line = document.createElement('div')
    line.textContent = pattern
    box.appendChild(line)
  })
}

function renderInspect (result, sourceURL) {
  if (!result || !result.ok) {
    const error = result && result.error
    showError(error === 'header' ? l('userscriptInstallHeaderError') : l('userscriptInstallFetchError'))
    return
  }
  currentSource = result.source
  currentSourceURL = sourceURL

  const display = result.display
  document.getElementById('install-source').textContent = sourceURL
  document.getElementById('install-name').textContent = display.nameLocal || display.name
  document.getElementById('install-version').textContent = display.version
  document.getElementById('install-author').textContent = display.author
  fieldVisible('install-author-field', !!display.author)
  document.getElementById('install-description').textContent = display.description
  fieldVisible('install-description-field', !!display.description)

  const matches = document.getElementById('install-matches')
  matches.textContent = ''
  const patterns = display.matches || []
  if (!patterns.length) {
    matches.textContent = l('userscriptInstallNoMatches')
  } else {
    patterns.forEach(function (pattern) {
      const line = document.createElement('div')
      line.textContent = pattern
      matches.appendChild(line)
    })
  }

  fillPatternList('install-includes-field', 'install-includes', display.includes || [])
  fillPatternList('install-excludes-field', 'install-excludes', display.excludes || [])
  fillPatternList('install-connect-field', 'install-connect', display.connect || [])

  const runAt = display.runAt || ''
  document.getElementById('install-runat').textContent = runAt
  fieldVisible('install-runat-field', !!runAt)

  const grants = document.getElementById('install-grants')
  grants.textContent = ''
  const labels = grantedLabels(display.grants)
  if (!labels.length) {
    const none = document.createElement('span')
    none.className = 'userscript-meta'
    none.textContent = l('userscriptInstallNoPermissions')
    grants.appendChild(none)
  } else {
    labels.forEach(function (label) {
      const chip = document.createElement('span')
      chip.className = 'grant-chip'
      chip.textContent = label
      grants.appendChild(chip)
    })
  }

  const risk = document.getElementById('install-risk')
  const risks = []
  if (userscriptMeta.grantList(display.grants).xmlhttpRequest) {
    risks.push(l('userscriptInstallRiskNetwork'))
  }
  if (userscriptMeta.isUniversal(display)) {
    risks.push(l('userscriptInstallRiskAllSites'))
  }
  risk.textContent = risks.join(' ')
  risk.hidden = !risks.length

  const replaces = document.getElementById('install-replaces')
  if (result.replaces) {
    replaces.textContent = l('userscriptInstallReplaces').replace('%s', (result.replaces.name + ' ' + result.replaces.version).trim())
    replaces.hidden = false
  } else {
    replaces.hidden = true
  }

  showView('install-view')
}

function inspect (sourceURL) {
  showView('loading-view')
  storeRequest('inspect', { url: sourceURL }).then(function (result) {
    renderInspect(result, sourceURL)
  }).catch(function () {
    showError(l('userscriptInstallFetchError'))
  })
}

document.getElementById('install-cancel').addEventListener('click', function () {
  if (history.length > 1) {
    history.back()
  } else {
    location.replace('min://app/pages/userscripts/index.html')
  }
})

document.getElementById('install-confirm').addEventListener('click', function () {
  const button = document.getElementById('install-confirm')
  button.disabled = true
  storeRequest('install', { source: currentSource, sourceUrl: currentSourceURL }).then(function (meta) {
    button.disabled = false
    document.getElementById('success-name').textContent = meta.name + ' ' + meta.version
    showView('success-view')
  }).catch(function (err) {
    button.disabled = false
    showError(String(err.message || err))
  })
})

document.getElementById('success-manage').addEventListener('click', function () {
  location.replace('min://app/pages/userscripts/index.html')
})

document.getElementById('success-back').addEventListener('click', function () {
  if (history.length > 1) {
    history.back()
  } else {
    location.replace('min://app/pages/userscripts/index.html')
  }
})

document.getElementById('error-retry').addEventListener('click', function () {
  inspect(currentSourceURL)
})

const params = new URLSearchParams(location.search)
const sourceURL = params.get('src')
if (sourceURL && /^(https?|file):\/\//i.test(sourceURL)) {
  inspect(sourceURL)
} else {
  showError(l('userscriptInstallFetchError'))
}
