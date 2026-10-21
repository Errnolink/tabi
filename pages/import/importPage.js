/* tab-import page. Sandbox page: all data goes through the postMessage preload bridge. */

document.title = l('importPageTitle') + ' | xb'

const BROWSER_HUES = { chrome: 217, edge: 190, helium: 38, brave: 14, vivaldi: 355, opera: 0, firefox: 24, zen: 268 }
const GENERIC_PROFILE = /^(default|default \(release\)|profile \d+|your chrome|person \d+)$/i
const GROUP_OPEN_LIMIT = 6

const state = {
  sources: [],
  selectedId: null,
  windows: [],
  bookmarks: [],
  containers: [],
  buckets: [],
  query: '',
  open: new Set(),
  importing: false
}

let requestCounter = 0
const pendingRequests = {}

function callMain (op, args) {
  return new Promise(function (resolve, reject) {
    requestCounter++
    pendingRequests[requestCounter] = { resolve, reject }
    window.postMessage({ message: 'importPage:' + op, id: requestCounter, args: args }, window.location.toString())
  })
}

window.addEventListener('message', function (e) {
  if (!e.data || e.data.message !== 'importPage:result') {
    return
  }
  const pending = pendingRequests[e.data.id]
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

function el (tag, className, text) {
  const node = document.createElement(tag)
  if (className) {
    node.className = className
  }
  if (text !== undefined) {
    node.textContent = text
  }
  return node
}

function hueFor (text) {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) % 360
  }
  return h
}

function browserKey (source) {
  return (source.id.split(':')[1] || '').toLowerCase()
}

function shortName (source) {
  const browser = source.browser.replace(/^(Google|Microsoft|Mozilla) /, '').replace(/ Browser$/, '')
  return source.name && !GENERIC_PROFILE.test(source.name) ? browser + ' · ' + source.name : browser
}

function parseUrl (url) {
  try {
    const u = new URL(url)
    return { host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/\/$/, '') || '/' }
  } catch (e) {
    return { host: url.split(':')[0] || 'other', path: url }
  }
}

function displayTitle (tab, parsed) {
  const title = (tab.title || '').trim()
  if (!title || /^https?:\/\//.test(title) || title === tab.url) {
    return parsed.path === '/' ? parsed.host : parsed.path
  }
  return title
}

function selectedSource () {
  return state.sources.find(s => s.id === state.selectedId) || null
}

function allTabs () {
  const list = []
  state.windows.forEach(function (w, wi) {
    w.tabs.forEach(function (tab, ti) {
      list.push({ w: wi, i: ti, tab, parsed: parseUrl(tab.url) })
    })
  })
  return list
}

function isChecked (item) {
  return state.windows[item.w].checked[item.i]
}

function setChecked (item, value) {
  state.windows[item.w].checked[item.i] = value
}

function selectedCount () {
  return state.windows.reduce((sum, w) => sum + w.checked.filter(Boolean).length, 0)
}

function matches (item) {
  if (!state.query) {
    return true
  }
  const hay = (item.tab.title + ' ' + item.tab.url).toLowerCase()
  return state.query.split(/\s+/).every(word => hay.includes(word))
}

/* browsers */

function renderSources () {
  const list = document.getElementById('source-list')
  list.textContent = ''
  if (!state.sources.length) {
    const empty = document.getElementById('imp-empty')
    empty.textContent = l('importNoSources')
    empty.hidden = false
    return
  }
  state.sources.forEach(function (source, index) {
    const card = el('button', 'imp-source' + (source.id === state.selectedId ? ' selected' : ''))
    card.disabled = source.tabCount === 0
    card.style.setProperty('--hue', BROWSER_HUES[browserKey(source)] ?? hueFor(source.browser))
    card.style.setProperty('--i', index)
    const avatar = el('span', 'imp-avatar', source.browser.replace(/^(Google|Microsoft|Mozilla) /, '').charAt(0))
    const text = el('span', 'imp-source-text')
    text.append(el('span', 'imp-source-name', source.browser.replace(/^(Google|Microsoft|Mozilla) /, '')), el('span', 'imp-source-profile', source.name || ''))
    const count = el('span', 'imp-source-count', source.tabCount ? String(source.tabCount) : '–')
    card.append(avatar, text, count)
    card.addEventListener('click', () => selectSource(source.id))
    list.appendChild(card)
  })
}

/* tabs, grouped by site */

function groups () {
  const map = new Map()
  allTabs().forEach(function (item) {
    const key = item.parsed.host
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key).push(item)
  })
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
}

function checkIcon (stateName) {
  return el('span', 'imp-check ' + stateName)
}

function renderTabs () {
  const list = document.getElementById('site-list')
  list.textContent = ''
  const searching = !!state.query
  groups().forEach(function ([host, items]) {
    const visible = items.filter(matches)
    if (!visible.length) {
      return
    }
    const checked = items.filter(isChecked).length
    const group = el('div', 'imp-site')
    const open = searching || state.open.has(host)
    group.classList.toggle('open', open)

    const head = el('div', 'imp-site-head')
    const groupState = checked === 0 ? 'off' : checked === items.length ? 'on' : 'mixed'
    const check = checkIcon(groupState)
    check.addEventListener('click', function (e) {
      e.stopPropagation()
      items.forEach(item => setChecked(item, groupState !== 'on'))
      renderTabs()
      updateBar()
    })
    const avatar = el('span', 'imp-favicon', host.charAt(0).toUpperCase())
    avatar.style.setProperty('--hue', hueFor(host))
    const name = el('span', 'imp-site-name', host)
    const count = el('span', 'imp-site-count', checked === items.length ? String(items.length) : checked + ' / ' + items.length)
    const chevron = el('span', 'imp-chevron i carbon:chevron-down')
    head.append(check, avatar, name, count, chevron)
    head.addEventListener('click', function () {
      if (state.open.has(host)) {
        state.open.delete(host)
      } else {
        state.open.add(host)
      }
      renderTabs()
    })
    group.appendChild(head)

    if (open) {
      const rows = el('div', 'imp-rows')
      visible.forEach(function (item) {
        const row = el('div', 'imp-row' + (isChecked(item) ? '' : ' off'))
        const title = el('span', 'imp-row-title', displayTitle(item.tab, item.parsed))
        title.title = item.tab.url
        const path = el('span', 'imp-row-path', item.parsed.path)
        row.append(checkIcon(isChecked(item) ? 'on' : 'off'), title, path)
        row.addEventListener('click', function () {
          setChecked(item, !isChecked(item))
          renderTabs()
          updateBar()
        })
        rows.appendChild(row)
      })
      group.appendChild(rows)
    }
    list.appendChild(group)
  })
}

/* action bar */

function renderTargets () {
  const select = document.getElementById('target-select')
  const previous = select.value
  select.textContent = ''
  const fresh = el('option', '', state.windows.length > 1 ? l('importTargetPerWindow') : l('importTargetNew').replace('%s', shortName(selectedSource())))
  fresh.value = '@new'
  select.appendChild(fresh)
  state.buckets.forEach(function (bucket, i) {
    const option = el('option', '', bucket.name || l('defaultTaskName').replace('%n', i + 1))
    option.value = bucket.id
    select.appendChild(option)
  })
  select.value = Array.from(select.options).some(o => o.value === previous) ? previous : '@new'

  const containerSelect = document.getElementById('container-select')
  const previousContainer = containerSelect.value
  containerSelect.textContent = ''
  state.containers.forEach(function (container) {
    const option = el('option', '', container.name)
    option.value = container.id
    containerSelect.appendChild(option)
  })
  if (previousContainer) {
    containerSelect.value = previousContainer
  }
}

function updateBar () {
  const count = selectedCount()
  const bookmarks = document.getElementById('import-bookmarks').checked ? state.bookmarks.length : 0
  const total = count + bookmarks
  document.getElementById('selection-count').textContent = l('importSelected').replace('%n', count).replace('%t', allTabs().length)
  document.getElementById('import-button-label').textContent = state.importing ? l('importWorking') : (total === 1 ? l('importButtonOne') : l('importButton').replace('%n', total))
  document.getElementById('import-button').disabled = state.importing || total === 0
}

/* flow */

function selectSource (id) {
  state.selectedId = id
  state.query = ''
  document.getElementById('tab-search').value = ''
  document.getElementById('import-status').textContent = ''
  renderSources()
  const source = selectedSource()
  const panel = document.getElementById('tab-panel')
  const bar = document.getElementById('action-bar')
  const empty = document.getElementById('imp-empty')
  if (!source) {
    return
  }
  panel.classList.add('loading')
  callMain('read', { id: source.id, includeBookmarks: !!source.hasBookmarks }).then(function (result) {
    if (state.selectedId !== source.id) {
      return
    }
    state.windows = (result.windows || []).map(w => ({ tabs: w.tabs, checked: w.tabs.map(() => true) }))
    state.bookmarks = result.bookmarks || []
    const g = groups()
    state.open = new Set(g.length <= 3 ? g.map(([host]) => host) : g.filter(([, items]) => items.length <= GROUP_OPEN_LIMIT).slice(0, 2).map(([host]) => host))
    document.getElementById('bookmarks-row').hidden = state.bookmarks.length === 0
    document.getElementById('import-bookmarks').checked = false
    empty.hidden = true
    panel.hidden = false
    bar.hidden = false
    panel.classList.remove('loading')
    renderTabs()
    renderTargets()
    updateBar()
  }).catch(function () {
    panel.hidden = true
    bar.hidden = true
    empty.textContent = l('importReadError')
    empty.hidden = false
  })
}

function doImport () {
  const source = selectedSource()
  if (state.importing || !source) {
    return
  }
  const windowsPayload = state.windows
    .map(w => ({ tabs: w.tabs.filter((tab, i) => w.checked[i]) }))
    .filter(w => w.tabs.length > 0)
  const target = document.getElementById('target-select').value
  const payload = {
    sourceName: shortName(source),
    mode: target === '@new' ? 'perWindow' : 'existing',
    bucketId: target === '@new' ? '' : target,
    containerId: document.getElementById('container-select').value,
    windows: windowsPayload,
    bookmarks: document.getElementById('import-bookmarks').checked ? state.bookmarks : []
  }
  if (!payload.windows.length && !payload.bookmarks.length) {
    return
  }
  state.importing = true
  updateBar()
  const status = document.getElementById('import-status')
  callMain('import', payload).then(function (result) {
    state.importing = false
    if (result && result.accepted) {
      status.textContent = result.count === 1 ? l('importImportedOne') : l('importImported').replace('%n', result.count)
      status.classList.add('done')
      callMain('buckets').then(function (list) {
        state.buckets = list || []
        renderTargets()
      })
    } else {
      status.textContent = l('importReadError')
    }
    updateBar()
  }).catch(function () {
    state.importing = false
    status.textContent = l('importReadError')
    updateBar()
  })
}

document.getElementById('tab-search').placeholder = l('importSearch')
document.getElementById('tab-search').addEventListener('input', function () {
  state.query = this.value.trim().toLowerCase()
  renderTabs()
})
document.getElementById('select-all').addEventListener('click', function () {
  allTabs().filter(matches).forEach(item => setChecked(item, true))
  renderTabs()
  updateBar()
})
document.getElementById('select-none').addEventListener('click', function () {
  allTabs().filter(matches).forEach(item => setChecked(item, false))
  renderTabs()
  updateBar()
})
document.getElementById('import-bookmarks').addEventListener('change', updateBar)
document.getElementById('import-button').addEventListener('click', doImport)

Promise.all([callMain('sources'), callMain('containers'), callMain('buckets')]).then(function ([sources, containers, buckets]) {
  state.sources = sources || []
  state.containers = containers || []
  state.buckets = buckets || []
  renderSources()
  const preferred = state.sources.find(s => s.tabCount > 0)
  if (preferred) {
    selectSource(preferred.id)
  }
}).catch(function () {
  const empty = document.getElementById('imp-empty')
  empty.textContent = l('importReadError')
  empty.hidden = false
})
