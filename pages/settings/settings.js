document.title = l('settingsPreferencesHeading') + ' | Tabi'

var banner = document.getElementById('restart-required-banner')

function showRestartRequiredBanner () {
  if (banner) {
    banner.hidden = false
  }
  settings.set('restartNow', true)
}

settings.get('restartNow', function (value) {
  if (value === true) {
    showRestartRequiredBanner()
  }
})

var searchInput = document.getElementById('settings-search')
var searchClearBtn = document.getElementById('settings-search-clear')
var noResultsState = document.getElementById('settings-search-no-results')

function filterSettings (query) {
  query = (query || '').trim().toLowerCase()
  if (searchClearBtn) {
    searchClearBtn.hidden = !query
  }

  var sections = document.querySelectorAll('.settings-container')
  var anyVisible = false

  sections.forEach(function (section) {
    var sectionHeader = section.querySelector('.section-header h3')
    var sectionSubtitle = section.querySelector('.section-subtitle')
    var sectionTitleMatch = (sectionHeader && sectionHeader.textContent.toLowerCase().includes(query)) ||
      (sectionSubtitle && sectionSubtitle.textContent.toLowerCase().includes(query))

    var rows = section.querySelectorAll('.setting-row, .setting-section')
    var sectionHasMatch = false

    rows.forEach(function (row) {
      if (!query || sectionTitleMatch) {
        row.classList.remove('search-hidden')
        sectionHasMatch = true
      } else {
        var rowText = (row.textContent || '').toLowerCase()
        if (rowText.includes(query)) {
          row.classList.remove('search-hidden')
          sectionHasMatch = true
        } else {
          row.classList.add('search-hidden')
        }
      }
    })

    if (!query || sectionHasMatch) {
      section.classList.remove('search-hidden')
      anyVisible = true
    } else {
      section.classList.add('search-hidden')
    }

    var navItem = document.querySelector('#settings-nav a[href="#' + section.id + '"]')
    if (navItem) {
      if (!query || sectionHasMatch) {
        navItem.classList.remove('search-hidden')
      } else {
        navItem.classList.add('search-hidden')
      }
    }
  })

  if (noResultsState) {
    noResultsState.hidden = anyVisible
  }
}

if (searchInput) {
  searchInput.addEventListener('input', function () {
    filterSettings(this.value)
  })
}

if (searchClearBtn) {
  searchClearBtn.addEventListener('click', function () {
    searchInput.value = ''
    filterSettings('')
    searchInput.focus()
  })
}

var navItems = Array.from(document.querySelectorAll('#settings-nav .nav-item'))
var sectionIds = navItems.map(function (item) {
  var href = item.getAttribute('href')
  return href && href.startsWith('#') ? href.substring(1) : null
}).filter(Boolean)

var sections = sectionIds.map(function (id) {
  return document.getElementById(id)
}).filter(Boolean)

function onNavClick (e) {
  e.preventDefault()
  var targetId = this.getAttribute('href').substring(1)
  var target = document.getElementById(targetId)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    navItems.forEach(function (item) { item.classList.remove('active') })
    this.classList.add('active')
  }
}

navItems.forEach(function (item) {
  item.addEventListener('click', onNavClick)
})

if (typeof IntersectionObserver !== 'undefined') {
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var id = entry.target.id
        navItems.forEach(function (item) {
          if (item.getAttribute('href') === '#' + id) {
            item.classList.add('active')
          } else {
            item.classList.remove('active')
          }
        })
      }
    })
  }, {
    rootMargin: '-10% 0px -70% 0px',
    threshold: 0
  })

  sections.forEach(function (section) {
    observer.observe(section)
  })
}
