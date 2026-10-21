document.title = l('userscriptsPageTitle') + ' | xb'

const PAGE_PREFIX = 'userscriptsPage:'
const SUGGESTED_META = {
  'control-panel-for-twitter': {
    name: 'Control Panel for Twitter',
    description: l('userscriptsSuggestedCpftDescription')
  }
}

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
  } else if (e.data.message === PAGE_PREFIX + 'changed') {
    refresh()
  }
})

function setStatus (text) {
  document.getElementById('userscripts-status').textContent = text || ''
}

function matchSummary (script) {
  var patterns = script.matches || []
  var total = script.matchCount || patterns.length
  var shown = patterns.slice(0, 2).join(', ')
  if (total > patterns.length) {
    shown += ' +' + (total - patterns.length)
  }
  return shown
}

function renderSuggested (suggested) {
  var section = document.getElementById('suggested-section')
  var list = document.getElementById('suggested-list')
  list.textContent = ''
  var entries = (suggested || []).filter(function (entry) { return !entry.installed })
  if (!entries.length) {
    section.hidden = true
    return
  }
  section.hidden = false
  entries.forEach(function (entry) {
    var meta = SUGGESTED_META[entry.id] || { name: entry.id, description: '' }
    var card = document.createElement('div')
    card.className = 'pebble-card userscript-card suggested-card'

    var info = document.createElement('div')
    info.className = 'userscript-info'
    var nameRow = document.createElement('div')
    nameRow.className = 'userscript-name-row'
    var name = document.createElement('span')
    name.className = 'userscript-name'
    name.textContent = meta.name
    nameRow.appendChild(name)
    info.appendChild(nameRow)
    var desc = document.createElement('p')
    desc.className = 'userscript-description'
    desc.textContent = meta.description
    info.appendChild(desc)

    var actions = document.createElement('div')
    actions.className = 'userscript-actions'
    var installButton = document.createElement('button')
    installButton.className = 'btn-jewel'
    installButton.textContent = l('userscriptsInstall')
    installButton.addEventListener('click', function () {
      installButton.disabled = true
      installButton.textContent = l('userscriptsInstalling')
      storeRequest('installBundled', { id: entry.id }).then(function () {
        refresh()
      }).catch(function (err) {
        installButton.disabled = false
        installButton.textContent = l('userscriptsInstall')
        setStatus(String(err.message || err))
      })
    })
    actions.appendChild(installButton)

    card.appendChild(info)
    card.appendChild(actions)
    list.appendChild(card)
  })
}

function renderScripts (scripts) {
  var list = document.getElementById('script-list')
  list.textContent = ''

  document.getElementById('empty-state').hidden = scripts.length > 0

  scripts.forEach(function (script) {
    var card = document.createElement('div')
    card.className = 'pebble-card userscript-card'
    if (script.enabled === false) {
      card.classList.add('disabled')
    }

    var info = document.createElement('div')
    info.className = 'userscript-info'

    var nameRow = document.createElement('div')
    nameRow.className = 'userscript-name-row'
    var name = document.createElement('span')
    name.className = 'userscript-name'
    name.textContent = script.name
    nameRow.appendChild(name)
    var version = document.createElement('span')
    version.className = 'userscript-version'
    version.textContent = script.version
    nameRow.appendChild(version)
    info.appendChild(nameRow)

    if (script.description) {
      var desc = document.createElement('p')
      desc.className = 'userscript-description'
      desc.textContent = script.description
      info.appendChild(desc)
    }

    var matches = matchSummary(script)
    if (matches) {
      var matchLine = document.createElement('p')
      matchLine.className = 'userscript-meta'
      matchLine.textContent = l('userscriptInstallFieldRunsOn') + ' ' + matches
      info.appendChild(matchLine)
    }

    var actions = document.createElement('div')
    actions.className = 'userscript-actions'

    var toggleWrap = document.createElement('label')
    toggleWrap.className = 'userscript-toggle'
    var toggleLabel = document.createElement('span')
    toggleLabel.textContent = l('userscriptsEnabledSwitch')
    var toggle = document.createElement('input')
    toggle.type = 'checkbox'
    toggle.checked = script.enabled !== false
    toggle.addEventListener('change', function () {
      storeRequest('setEnabled', { id: script.id, enabled: toggle.checked }).then(function () {
        refresh()
      })
    })
    toggleWrap.appendChild(toggleLabel)
    toggleWrap.appendChild(toggle)
    actions.appendChild(toggleWrap)

    if (script.canUpdate) {
      var updateButton = document.createElement('button')
      updateButton.className = 'btn-tonal'
      updateButton.textContent = l('userscriptsUpdateNow')
      updateButton.addEventListener('click', function () {
        updateButton.disabled = true
        storeRequest('checkUpdates', { id: script.id }).then(function (results) {
          updateButton.disabled = false
          showUpdateResults(results)
          refresh()
        }).catch(function (err) {
          updateButton.disabled = false
          setStatus(String(err.message || err))
        })
      })
      actions.appendChild(updateButton)
    }

    var deleteButton = document.createElement('button')
    deleteButton.className = 'chip-coral'
    deleteButton.textContent = l('userscriptsDelete')
    var deleteArmTimeout = null
    deleteButton.addEventListener('click', function () {
      if (deleteButton.dataset.confirm === 'true') {
        clearTimeout(deleteArmTimeout)
        storeRequest('remove', { id: script.id }).then(refresh)
        return
      }
      deleteButton.dataset.confirm = 'true'
      deleteButton.textContent = l('userscriptsDeleteConfirm')
      deleteArmTimeout = setTimeout(function () {
        deleteButton.dataset.confirm = 'false'
        deleteButton.textContent = l('userscriptsDelete')
      }, 2500)
    })
    actions.appendChild(deleteButton)

    card.appendChild(info)
    card.appendChild(actions)
    list.appendChild(card)
  })
}

function showUpdateResults (results) {
  var updated = (results || []).filter(function (r) { return r.updated })
  var failed = (results || []).filter(function (r) { return r.error && r.error !== 'no update URL' })
  if (failed.length) {
    setStatus(failed.map(function (r) { return r.id + ': ' + r.error }).join(', '))
  } else if (updated.length) {
    setStatus(l('userscriptsStatusUpdated').replace('%s', updated.map(function (r) { return r.id }).join(', ')))
  } else {
    setStatus(l('userscriptsStatusUpToDate'))
  }
}

function refreshBanner (value) {
  document.getElementById('disabled-banner').hidden = value !== false
}

settings.listen('userscriptsEnabled', refreshBanner)

function refresh () {
  storeRequest('suggested').then(renderSuggested).catch(function () { })
  storeRequest('list').then(function (scripts) {
    renderScripts(scripts || [])
    setStatus('')
  }).catch(function (err) {
    setStatus(String(err.message || err))
  })
}

document.getElementById('check-updates').addEventListener('click', function () {
  setStatus(l('userscriptsStatusChecking'))
  storeRequest('checkUpdates', {}).then(function (results) {
    showUpdateResults(results)
    refresh()
  }).catch(function (err) {
    setStatus(String(err.message || err))
  })
})

refresh()
