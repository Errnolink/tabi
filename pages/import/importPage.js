/* tab-import page. Sandbox page: all data goes through the postMessage preload bridge. */

document.title = l('importPageTitle') + ' | xb'

var state = {
  sources: [],
  selectedId: null,
  windows: [], // [{ tabs: [{url, title}], checked: [bool] }]
  bookmarks: [],
  containers: [],
  buckets: [],
  importing: false
}

var requestCounter = 0
var pendingRequests = {}

function callMain (op, args) {
  return new Promise(function (resolve, reject) {
    requestCounter++
    pendingRequests[requestCounter] = { resolve, reject }
    window.postMessage({ message: 'importPage:' + op, id: requestCounter, args: args }, window.location.toString())
  })
}

window.addEventListener('message', function (e) {
  if (!e.data || typeof e.data.message !== 'string' || e.data.message !== 'importPage:result') {
    return
  }
  var pending = pendingRequests[e.data.id]
  if (!pending) {
    return
  }
  delete pendingRequests[e.data.id]
  if (e.data.error) {
    pending.reject(new Error(e.data.error))
  } else {
    pending.resolve(e.data.result)
  }
})

/* sources list */

function renderSources () {
  var list = document.getElementById('source-list')
  list.textContent = ''
  if (state.sources.length === 0) {
    var empty = document.createElement('p')
    empty.className = 'source-profile'
    empty.textContent = l('importNoSources')
    list.appendChild(empty)
    return
  }
  state.sources.forEach(function (source, index) {
    var row = document.createElement('div')
    row.className = 'source-row pebble-card' + (source.id === state.selectedId ? ' selected' : '') + (source.tabCount === 0 ? ' empty' : '')
    row.style.setProperty('--i', index)

    var icon = document.createElement('i')
    icon.className = 'i carbon:application-web source-icon'
    row.appendChild(icon)

    var text = document.createElement('div')
    text.className = 'source-text'
    var name = document.createElement('div')
    name.className = 'source-name'
    name.textContent = source.browser
    var profile = document.createElement('div')
    profile.className = 'source-profile'
    profile.textContent = source.name
    text.appendChild(name)
    text.appendChild(profile)
    row.appendChild(text)

    var chip = document.createElement('span')
    chip.className = 'count-chip'
    chip.textContent = source.tabCount === 0 ? l('importSourceNoTabs') : l('importSourceTabs').replace('%n', source.tabCount)
    row.appendChild(chip)

    if (source.tabCount > 0) {
      row.addEventListener('click', function () {
        selectSource(source.id)
      })
    }
    list.appendChild(row)
  })
}

/* tab list */

function checkedCount () {
  var n = 0
  state.windows.forEach(function (w) {
    w.checked.forEach(function (c) {
      if (c) n++
    })
  })
  return n
}

function updateImportButton () {
  var n = checkedCount() + (document.getElementById('import-bookmarks').checked ? state.bookmarks.length : 0)
  var label = document.getElementById('import-button-label')
  if (n === 1) {
    label.textContent = l('importButtonOne')
  } else {
    label.textContent = l('importButton').replace('%n', n)
  }
  document.getElementById('import-button').disabled = state.importing || n === 0 || (targetMode() === 'existing' && !document.getElementById('bucket-select').value)
}

function targetMode () {
  var checked = document.querySelector('input[name="import-target"]:checked')
  return checked ? checked.value : 'perWindow'
}

function renderWindows () {
  var list = document.getElementById('window-list')
  list.textContent = ''
  document.getElementById('tabs-total').textContent = checkedCount() + ' / ' + state.windows.reduce(function (n, w) { return n + w.tabs.length }, 0)

  state.windows.forEach(function (windowData, wIndex) {
    var wrap = document.createElement('div')
    wrap.className = 'import-window'

    var head = document.createElement('label')
    head.className = 'import-window-head radio-pebble'
    var headBox = document.createElement('input')
    headBox.type = 'checkbox'
    headBox.checked = windowData.checked.every(function (c) { return c })
    headBox.addEventListener('change', function () {
      windowData.checked = windowData.tabs.map(function () { return headBox.checked })
      renderWindows()
    })
    head.appendChild(headBox)
    var headLabel = document.createElement('span')
    headLabel.textContent = l('importWindow').replace('%n', wIndex + 1) + ' — ' + windowData.tabs.length
    head.appendChild(headLabel)
    wrap.appendChild(head)

    windowData.tabs.forEach(function (tab, tIndex) {
      var row = document.createElement('label')
      row.className = 'import-tab-row'
      var box = document.createElement('input')
      box.type = 'checkbox'
      box.checked = windowData.checked[tIndex]
      box.addEventListener('change', function () {
        windowData.checked[tIndex] = box.checked
        document.getElementById('tabs-total').textContent = checkedCount() + ' / ' + state.windows.reduce(function (n, w) { return n + w.tabs.length }, 0)
        updateImportButton()
      })
      row.appendChild(box)

      var text = document.createElement('div')
      text.className = 'import-tab-text'
      var title = document.createElement('span')
      title.className = 'import-tab-title'
      title.textContent = tab.title
      var url = document.createElement('span')
      url.className = 'import-tab-url'
      url.textContent = tab.url
      text.appendChild(title)
      text.appendChild(url)
      row.appendChild(text)
      wrap.appendChild(row)
    })

    list.appendChild(wrap)
  })
}

function renderOptions () {
  // destination buckets
  var bucketSelect = document.getElementById('bucket-select')
  bucketSelect.textContent = ''
  state.buckets.forEach(function (bucket) {
    var opt = document.createElement('option')
    opt.value = bucket.id
    opt.textContent = bucket.name || 'Bucket'
    bucketSelect.appendChild(opt)
  })
  bucketSelect.disabled = targetMode() !== 'existing' || state.buckets.length === 0

  // containers
  var containerSelect = document.getElementById('container-select')
  containerSelect.textContent = ''
  state.containers.forEach(function (container) {
    var opt = document.createElement('option')
    opt.value = container.id
    opt.textContent = container.name
    containerSelect.appendChild(opt)
  })
  if (!state.containers.some(function (c) { return c.id === 'default' })) {
    var opt = document.createElement('option')
    opt.value = 'default'
    opt.textContent = 'Default'
    containerSelect.appendChild(opt)
  }
}

function selectedSource () {
  return state.sources.find(function (s) { return s.id === state.selectedId }) || null
}

function selectSource (id) {
  state.selectedId = id
  renderSources()
  var detail = document.getElementById('detail-content')
  var empty = document.getElementById('detail-empty')
  var error = document.getElementById('detail-error')
  detail.hidden = true
  error.hidden = true
  empty.hidden = true
  var source = selectedSource()
  if (!source) {
    empty.hidden = false
    return
  }
  callMain('read', { id: source.id, includeBookmarks: !!source.hasBookmarks }).then(function (result) {
    if (state.selectedId !== source.id) {
      return
    }
    state.windows = (result.windows || []).map(function (w) {
      return { tabs: w.tabs, checked: w.tabs.map(function () { return true }) }
    })
    state.bookmarks = result.bookmarks || []
    document.getElementById('bookmarks-row').hidden = state.bookmarks.length === 0
    document.getElementById('import-bookmarks').checked = false
    document.getElementById('import-status').textContent = ''
    renderWindows()
    callMain('buckets').then(function (list) {
      state.buckets = list || []
      renderOptions()
      updateImportButton()
    })
    renderOptions()
    updateImportButton()
    detail.hidden = false
  }).catch(function () {
    error.hidden = false
  })
}

/* import */

function doImport () {
  if (state.importing) {
    return
  }
  var source = selectedSource()
  if (!source) {
    return
  }
  var windowsPayload = state.windows
    .map(function (w) {
      return { tabs: w.tabs.filter(function (tab, i) { return w.checked[i] }) }
    })
    .filter(function (w) { return w.tabs.length > 0 })

  var payload = {
    sourceName: source.browser + (source.name && source.name !== source.browser ? ' — ' + source.name : ''),
    mode: targetMode(),
    bucketId: document.getElementById('bucket-select').value,
    containerId: document.getElementById('container-select').value || 'default',
    windows: windowsPayload,
    bookmarks: document.getElementById('import-bookmarks').checked ? state.bookmarks : []
  }
  if (payload.windows.length === 0 && payload.bookmarks.length === 0) {
    return
  }
  state.importing = true
  updateImportButton()
  callMain('import', payload).then(function (result) {
    state.importing = false
    var status = document.getElementById('import-status')
    if (result && result.accepted) {
      status.textContent = result.count === 1 ? l('importImportedOne') : l('importImported').replace('%n', result.count)
    } else {
      status.textContent = l('importReadError')
    }
    updateImportButton()
  }).catch(function () {
    state.importing = false
    document.getElementById('import-status').textContent = l('importReadError')
    updateImportButton()
  })
}

/* wiring */

document.querySelectorAll('input[name="import-target"]').forEach(function (input) {
  input.addEventListener('change', function () {
    renderOptions()
    updateImportButton()
  })
})
document.getElementById('bucket-select').addEventListener('change', updateImportButton)
document.getElementById('container-select').addEventListener('change', updateImportButton)
document.getElementById('import-bookmarks').addEventListener('change', updateImportButton)
document.getElementById('import-button').addEventListener('click', doImport)

/* boot */

Promise.all([
  callMain('sources'),
  callMain('containers'),
  callMain('buckets')
]).then(function (results) {
  state.sources = results[0] || []
  state.containers = results[1] || []
  state.buckets = results[2] || []
  renderSources()
  var preferred = state.sources.find(function (s) { return s.tabCount > 0 })
  if (preferred) {
    selectSource(preferred.id)
  } else {
    document.getElementById('detail-empty').hidden = false
  }
}).catch(function () {
  document.getElementById('detail-empty').hidden = false
})
