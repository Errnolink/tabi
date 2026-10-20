/* extensions management page; talks to main/extensions.js through the view
   preload relay (postMessage in, 'extensionsReply' out) */

function requestExtensions (type, id) {
  return new Promise(function (resolve) {
    var requestId = 'ext-' + Date.now() + '-' + Math.round(Math.random() * 1e9)
    var listener = function (e) {
      if (e.data && e.data.message === 'extensionsReply' && e.data.data && e.data.data.replyTo === requestId) {
        window.removeEventListener('message', listener)
        if (e.data.data.error) {
          console.warn('extensions request failed:', e.data.data.error)
        }
        resolve(e.data.data.extensions || [])
      }
    }
    window.addEventListener('message', listener)
    window.postMessage({
      message: 'extensionsRequest',
      type: type,
      id: id,
      requestId: requestId
    }, window.location.toString())
    setTimeout(function () {
      window.removeEventListener('message', listener)
      resolve([])
    }, 30000)
  })
}

function formatPartitions (extension) {
  var count = extension.partitions ? extension.partitions.length : 0
  if (count <= 1) {
    return 'enabled in 1 container'
  }
  return 'enabled in ' + count + ' containers'
}

function render (extensions) {
  var list = document.getElementById('extensions-list')
  list.textContent = ''

  if (!extensions.length) {
    var empty = document.createElement('div')
    empty.className = 'extensions-empty'
    empty.textContent = 'No extensions installed yet. Open the Chrome Web Store to add some.'
    list.appendChild(empty)
    return
  }

  extensions.forEach(function (extension) {
    var card = document.createElement('div')
    card.className = 'extension-card'
    card.setAttribute('data-extension-id', extension.id)

    var icon = document.createElement('img')
    icon.className = 'extension-icon'
    icon.src = extension.iconUrl
    icon.alt = ''
    card.appendChild(icon)

    var info = document.createElement('div')
    info.className = 'extension-info'

    var nameRow = document.createElement('div')
    nameRow.className = 'extension-name'
    nameRow.textContent = extension.name

    var version = document.createElement('span')
    version.className = 'extension-version'
    version.textContent = extension.version ? 'v' + extension.version : ''
    nameRow.appendChild(version)

    if (extension.manifestVersion) {
      var badge = document.createElement('span')
      badge.className = 'extension-manifest-badge'
      badge.textContent = 'MV' + extension.manifestVersion
      nameRow.appendChild(badge)
    }

    info.appendChild(nameRow)

    if (extension.description) {
      var description = document.createElement('p')
      description.className = 'extension-description'
      description.textContent = extension.description
      info.appendChild(description)
    }

    var meta = document.createElement('p')
    meta.className = 'extension-meta'
    var metaText = formatPartitions(extension)
    if (extension.blocksMinFilter) {
      metaText += ' \u00b7 handles ad/tracker blocking (Min\u2019s built-in filter is off)'
    }
    meta.textContent = metaText
    info.appendChild(meta)

    card.appendChild(info)

    var removeButton = document.createElement('button')
    removeButton.className = 'extension-remove'
    removeButton.textContent = 'Remove'
    removeButton.addEventListener('click', function () {
      if (removeButton.getAttribute('data-confirm') !== 'true') {
        removeButton.setAttribute('data-confirm', 'true')
        removeButton.textContent = 'Confirm'
        setTimeout(function () {
          removeButton.removeAttribute('data-confirm')
          removeButton.textContent = 'Remove'
        }, 3000)
        return
      }
      setStatus('Removing ' + extension.name + '\u2026')
      requestExtensions('uninstall', extension.id).then(render)
    })
    card.appendChild(removeButton)

    list.appendChild(card)
  })
}

function setStatus (text) {
  document.getElementById('extensions-status').textContent = text || ''
}

document.getElementById('open-web-store').addEventListener('click', function () {
  window.open('https://chromewebstore.google.com/')
})

document.getElementById('check-updates').addEventListener('click', function () {
  setStatus('Checking for updates\u2026')
  requestExtensions('update').then(function (extensions) {
    render(extensions)
    setStatus(extensions.length ? 'Extensions are up to date.' : '')
  })
})

requestExtensions('list').then(render)
