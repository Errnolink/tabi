const DEFAULT_SHORTCUTS = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' }
]

function shortcutIsSafe (url) {
  if (typeof url !== 'string') {
    return false
  }
  try {
    var parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch (e) {
    return false
  }
}

function getShortcuts (saved) {
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.filter(function (shortcut) {
      return shortcut && shortcutIsSafe(shortcut.url)
    })
  }
  return DEFAULT_SHORTCUTS.slice()
}

function updateClock () {
  const now = new Date()
  const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const timeEl = document.getElementById('ntp-clock-time')
  const dateEl = document.getElementById('ntp-clock-date')
  if (timeEl) timeEl.textContent = timeStr
  if (dateEl) dateEl.textContent = dateStr
}

function renderShortcuts (shortcuts) {
  const grid = document.getElementById('ntp-shortcuts-grid')
  if (!grid) return
  grid.innerHTML = ''

  shortcuts.forEach(shortcut => {
    const item = document.createElement('a')
    item.className = 'ntp-shortcut-item'
    item.href = shortcut.url

    const tile = document.createElement('div')
    tile.className = 'ntp-shortcut-tile'

    const fallback = document.createElement('div')
    fallback.className = 'ntp-shortcut-letter'
    fallback.textContent = (shortcut.title || shortcut.url).charAt(0).toUpperCase()

    tile.appendChild(fallback)

    const title = document.createElement('div')
    title.className = 'ntp-shortcut-title'
    title.textContent = shortcut.title || shortcut.url

    item.appendChild(tile)
    item.appendChild(title)
    grid.appendChild(item)
  })
}

function getSearchURL (query) {
  const engine = window.currentSearchEngine
  if (engine && typeof engine.searchURL === 'string' && engine.searchURL.indexOf('%s') !== -1) {
    return engine.searchURL.replace('%s', encodeURIComponent(query))
  }
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
}

function initSearch () {
  const input = document.getElementById('ntp-search-input')
  if (!input) return
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const q = input.value.trim()
      if (q) {
        let target = null
        if (/^https?:\/\//i.test(q)) {
          target = q
        } else if (q.includes('.') && !q.includes(' ')) {
          target = 'https://' + q
        }
        window.location.href = target || getSearchURL(q)
      }
    }
  })
}

document.addEventListener('DOMContentLoaded', function () {
  updateClock()
  setInterval(updateClock, 1000)
  initSearch()

  if (typeof settings !== 'undefined') {
    settings.listen('newTabShortcuts', function (saved) {
      renderShortcuts(getShortcuts(saved))
    })
  } else {
    renderShortcuts(getShortcuts(null))
  }
})
