const DEFAULT_SHORTCUTS = [
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'Wikipedia', url: 'https://www.wikipedia.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Gmail', url: 'https://mail.google.com' },
  { title: 'Reddit', url: 'https://www.reddit.com' }
]

function getFaviconUrl (url) {
  try {
    const host = new URL(url).hostname
    if (!host) return null
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=128'
  } catch (e) {
    return null
  }
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

function renderShortcuts () {
  const grid = document.getElementById('ntp-shortcuts-grid')
  if (!grid) return
  grid.innerHTML = ''

  DEFAULT_SHORTCUTS.forEach(shortcut => {
    const item = document.createElement('a')
    item.className = 'ntp-shortcut-item'
    item.href = shortcut.url

    const tile = document.createElement('div')
    tile.className = 'ntp-shortcut-tile'

    const img = document.createElement('img')
    img.className = 'ntp-shortcut-icon'
    img.loading = 'lazy'
    img.decoding = 'async'
    const iconUrl = getFaviconUrl(shortcut.url)

    const fallback = document.createElement('div')
    fallback.className = 'ntp-shortcut-letter'
    fallback.textContent = shortcut.title.charAt(0)

    if (iconUrl) {
      img.src = iconUrl
      img.onerror = () => {
        img.remove()
        tile.appendChild(fallback)
      }
      tile.appendChild(img)
    } else {
      tile.appendChild(fallback)
    }

    const title = document.createElement('div')
    title.className = 'ntp-shortcut-title'
    title.textContent = shortcut.title

    item.appendChild(tile)
    item.appendChild(title)
    grid.appendChild(item)
  })
}

function initSearch () {
  const input = document.getElementById('ntp-search-input')
  if (!input) return
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const q = input.value.trim()
      if (q) {
        if (q.includes('://') || q.includes('.')) {
          window.location.href = q.includes('://') ? q : 'https://' + q
        } else {
          window.location.href = 'https://duckduckgo.com/?q=' + encodeURIComponent(q)
        }
      }
    }
  })
}

document.addEventListener('DOMContentLoaded', function () {
  updateClock()
  setInterval(updateClock, 1000)
  renderShortcuts()
  initSearch()
})
