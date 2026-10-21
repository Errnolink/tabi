/* extensions management page; talks to main/extensions.js through the view
   preload relay (postMessage in, 'extensionsReply' out) */

function requestExtensions (type, id) {
  return new Promise(function (resolve) {
    var requestId = 'ext-' + Date.now() + '-' + Math.round(Math.random() * 1e9)
    var listener = function (e) {
      if (
        e.data &&
        e.data.message === 'extensionsReply' &&
        e.data.data &&
        e.data.data.replyTo === requestId
      ) {
        window.removeEventListener('message', listener)
        if (e.data.data.error) {
          setStatus('Extension update failed: ' + e.data.data.error)
        }
        resolve(e.data.data.extensions || [])
      }
    }
    window.addEventListener('message', listener)
    window.postMessage(
      {
        message: 'extensionsRequest',
        requestId: requestId,
        type: type,
        id: id
      },
      window.location.toString()
    )
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
    empty.className = 'extensions-empty pebble-card'

    var emptyPebble = document.createElement('div')
    emptyPebble.className = 'empty-pebble'
    var emptyIcon = document.createElement('i')
    emptyIcon.className = 'i carbon:shopping-cart'
    emptyPebble.appendChild(emptyIcon)
    empty.appendChild(emptyPebble)

    var emptyTitle = document.createElement('h3')
    emptyTitle.className = 'empty-title'
    emptyTitle.textContent = 'No extensions installed yet'
    empty.appendChild(emptyTitle)

    var emptyDesc = document.createElement('p')
    emptyDesc.className = 'empty-desc'
    emptyDesc.textContent = 'Browse the Chrome Web Store to find extensions for privacy, productivity, and customization.'
    empty.appendChild(emptyDesc)

    var emptyAction = document.createElement('button')
    emptyAction.className = 'btn-jewel empty-action'
    var btnIcon = document.createElement('i')
    btnIcon.className = 'i carbon:shopping-cart'
    emptyAction.appendChild(btnIcon)
    var btnText = document.createElement('span')
    btnText.textContent = 'Open Chrome Web Store'
    emptyAction.appendChild(btnText)
    emptyAction.addEventListener('click', function () {
      window.open('https://chromewebstore.google.com/')
    })
    empty.appendChild(emptyAction)

    list.appendChild(empty)
    return
  }

  extensions.forEach(function (extension, index) {
    var card = document.createElement('div')
    card.className = 'extension-card pebble-card'
    card.setAttribute('data-extension-id', extension.id)
    card.style.setProperty('--i', index)

    var iconWrap = document.createElement('div')
    iconWrap.className = 'extension-icon-wrap'

    if (extension.iconUrl) {
      var icon = document.createElement('img')
      icon.className = 'extension-icon'
      icon.src = extension.iconUrl
      icon.alt = ''
      icon.addEventListener('error', function () {
        icon.style.display = 'none'
        var fallback = document.createElement('i')
        fallback.className = 'i carbon:extension fallback-icon'
        iconWrap.appendChild(fallback)
      })
      iconWrap.appendChild(icon)
    } else {
      var fallback = document.createElement('i')
      fallback.className = 'i carbon:extension fallback-icon'
      iconWrap.appendChild(fallback)
    }
    card.appendChild(iconWrap)

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
      metaText += ' \u00b7 handles ad/tracker blocking'
    }
    meta.textContent = metaText
    info.appendChild(meta)

    card.appendChild(info)

    var removeButton = document.createElement('button')
    removeButton.className = 'extension-remove chip-coral'
    removeButton.innerHTML = '<i class="i carbon:trash-can"></i> <span>Remove</span>'
    removeButton.addEventListener('click', function () {
      if (removeButton.getAttribute('data-confirm') !== 'true') {
        removeButton.setAttribute('data-confirm', 'true')
        removeButton.innerHTML = '<i class="i carbon:trash-can"></i> <span>Confirm</span>'
        setTimeout(function () {
          removeButton.removeAttribute('data-confirm')
          removeButton.innerHTML = '<i class="i carbon:trash-can"></i> <span>Remove</span>'
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
    setStatus('')
    render(extensions)
  })
})

requestExtensions('list').then(render)
