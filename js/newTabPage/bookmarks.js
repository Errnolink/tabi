const searchbar = require('searchbar/searchbar.js')
const places = require('places/places.js')
const urlParser = require('util/urlParser.js')
const { resolveFavicon } = require('./favicons.js')

module.exports = function (newTabPage) {
  async function renderBookmarks () {
    if (!newTabPage.bookmarksContainer) return
    try {
      const items = await places.searchPlaces('', { searchBookmarks: true, limit: 12 })
      newTabPage.bookmarksContainer.innerHTML = ''
      if (!items || items.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'ntp-bookmarks-empty'
        empty.textContent = l('newTabNoBookmarks') || 'No bookmarks yet'
        newTabPage.bookmarksContainer.appendChild(empty)
        return
      }

      const sorted = items.slice().sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0)).slice(0, 12)
      sorted.forEach(function (bm) {
        const chip = document.createElement('div')
        chip.className = 'ntp-bookmark-chip'
        chip.title = (bm.title || bm.url) + '\n' + bm.url

        const img = document.createElement('img')
        img.loading = 'lazy'
        img.decoding = 'async'
        img.className = 'i carbon:bookmark'
        resolveFavicon(bm.url).then(function (dataUrl) {
          if (!img.isConnected) {
            return
          }
          if (dataUrl) {
            img.onerror = function () {
              img.className = 'i carbon:bookmark'
              img.removeAttribute('src')
            }
            img.src = dataUrl
            img.className = ''
          }
        })
        chip.appendChild(img)

        const title = document.createElement('span')
        title.textContent = bm.title || urlParser.basicURL(bm.url)
        chip.appendChild(title)

        chip.addEventListener('click', function (e) {
          searchbar.openURL(bm.url, e)
        })

        newTabPage.bookmarksContainer.appendChild(chip)
      })
    } catch (e) {
      console.warn('Failed to load bookmarks on new tab page', e)
    }
  }

  function buildSection (page) {
    const bookmarksSection = document.createElement('div')
    bookmarksSection.className = 'ntp-bookmarks-section'

    const bookmarksHeader = document.createElement('div')
    bookmarksHeader.className = 'ntp-section-header'
    const bmIcon = document.createElement('i')
    bmIcon.className = 'i carbon:bookmark'
    const bmLabel = document.createElement('span')
    bmLabel.textContent = l('newTabBookmarks') || 'Bookmarks'
    bookmarksHeader.appendChild(bmIcon)
    bookmarksHeader.appendChild(bmLabel)
    bookmarksSection.appendChild(bookmarksHeader)

    page.bookmarksContainer = document.createElement('div')
    page.bookmarksContainer.className = 'ntp-bookmarks-chips'
    bookmarksSection.appendChild(page.bookmarksContainer)
    page.mainEl.appendChild(bookmarksSection)
  }

  return {
    methods: {
      renderBookmarks
    },
    buildSection
  }
}
