const searchbarUtils = require('searchbar/searchbarUtils.js')
const urlParser = require('util/urlParser.js')

function getContainerInfo (containerId) {
  try {
    const containers = require('containers.js')
    if (containers && typeof containers.get === 'function') {
      const c = containers.get(containerId || 'default')
      if (c) {
        let iconClass = null
        if (typeof containers.carbonIcon === 'function') {
          iconClass = containers.carbonIcon(c.icon)
        }
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          icon: iconClass
        }
      }
    }
  } catch (e) {
    // containers module not yet created
  }
  const defaultColors = {
    personal: '#78536b',
    work: '#525a92',
    social: '#386a55',
    default: '#7c7c7d'
  }
  return {
    id: containerId || 'default',
    name: containerId ? containerId.charAt(0).toUpperCase() + containerId.slice(1) : 'Default',
    color: defaultColors[containerId] || '#7c7c7d',
    icon: null
  }
}

const overviewBuilder = {
  getContainerInfo: getContainerInfo,

  createTopControls: function (options) {
    const topControls = document.createElement('div')
    topControls.className = 'overview-top-controls'

    // Search Pebble
    const searchPebble = document.createElement('div')
    searchPebble.className = 'overview-search-pebble'

    const searchIcon = document.createElement('i')
    searchIcon.className = 'i carbon:search overview-search-icon'
    searchPebble.appendChild(searchIcon)

    const searchInput = document.createElement('input')
    searchInput.type = 'search'
    searchInput.className = 'overview-search-input'
    searchInput.placeholder = (typeof l === 'function' ? l('tasksSearchTabs') : 'Search tabs, accounts, buckets...') + ' (T)'
    searchInput.setAttribute('autocomplete', 'off')
    searchInput.setAttribute('spellcheck', 'false')

    const clearButton = document.createElement('button')
    clearButton.className = 'overview-search-clear i carbon:close'
    clearButton.title = 'Clear search'
    clearButton.hidden = true

    searchPebble.appendChild(searchInput)
    searchPebble.appendChild(clearButton)
    topControls.appendChild(searchPebble)

    // Container Filter Chips Bar
    const filterBar = document.createElement('div')
    filterBar.className = 'overview-filter-bar'

    const allChip = document.createElement('button')
    allChip.className = 'overview-chip active'
    allChip.setAttribute('data-container', 'all')
    allChip.textContent = 'All'
    filterBar.appendChild(allChip)

    let containerList = []
    try {
      const containers = require('containers.js')
      if (containers && typeof containers.list === 'function') {
        containerList = containers.list()
      }
    } catch (e) {}

    containerList.forEach(function (c) {
      const chip = document.createElement('button')
      chip.className = 'overview-chip'
      chip.setAttribute('data-container', c.id)

      const dot = document.createElement('span')
      dot.className = 'overview-chip-dot'
      dot.style.backgroundColor = c.color || '#7c7c7d'
      chip.appendChild(dot)

      const text = document.createElement('span')
      text.textContent = c.name
      chip.appendChild(text)

      filterBar.appendChild(chip)
    })
    return {
      element: topControls,
      input: searchInput,
      clearButton: clearButton,
      filterBar: filterBar
    }
  },
  createCard: function (tab, task, events) {
    const card = document.createElement('div')
    card.className = 'overview-card'
    card.setAttribute('data-tab', tab.id)
    card.setAttribute('data-bucket', task.id)
    card.setAttribute('data-container', tab.containerId || 'default')
    card.setAttribute('tabindex', '0')
    card.setAttribute('role', 'button')

    const selectedTab = tasks.getSelected() ? tasks.getSelected().tabs.getSelected() : null
    if (tab.id === selectedTab) {
      card.classList.add('is-selected')
    }

    // Container Stripe
    const containerInfo = getContainerInfo(tab.containerId)
    const stripe = document.createElement('div')
    stripe.className = 'overview-card-container-stripe'
    stripe.style.backgroundColor = containerInfo.color
    card.appendChild(stripe)

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.className = 'overview-card-close i carbon:close'
    closeBtn.title = 'Close tab'
    closeBtn.setAttribute('tabindex', '-1')
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      if (events.onTabClose) {
        events.onTabClose(tab.id, card)
      }
    })
    card.appendChild(closeBtn)

    // Thumbnail Wrap
    const thumbWrap = document.createElement('div')
    thumbWrap.className = 'overview-card-thumb-wrap'

    const thumbSrc = tab.thumbnailUrl || tab.previewImage
    if (thumbSrc) {
      const img = document.createElement('img')
      img.className = 'overview-card-thumb'
      img.setAttribute('loading', 'lazy')
      img.setAttribute('decoding', 'async')
      img.alt = ''
      img.src = thumbSrc
      img.onerror = function () {
        if (tab.previewImage && img.src !== tab.previewImage) {
          img.src = tab.previewImage
        } else {
          img.remove()
          const icon = document.createElement('i')
          icon.className = 'i carbon:document overview-card-placeholder-icon'
          thumbWrap.appendChild(icon)
        }
      }
      thumbWrap.appendChild(img)
    } else {
      const icon = document.createElement('i')
      icon.className = 'i carbon:document overview-card-placeholder-icon'
      thumbWrap.appendChild(icon)
    }
    card.appendChild(thumbWrap)

    // Info body
    const info = document.createElement('div')
    info.className = 'overview-card-info'

    const favTitle = document.createElement('div')
    favTitle.className = 'overview-card-favicon-title'

    if (tab.favicon && tab.favicon.url) {
      const fav = document.createElement('img')
      fav.className = 'overview-card-favicon'
      fav.src = tab.favicon.url
      fav.alt = ''
      favTitle.appendChild(fav)
    } else {
      const fav = document.createElement('i')
      fav.className = 'i carbon:earth-filled overview-card-favicon'
      favTitle.appendChild(fav)
    }

    const titleEl = document.createElement('span')
    titleEl.className = 'overview-card-title'
    const displayTitle = tab.title || (typeof l === 'function' ? l('newTabLabel') : 'New Tab')
    titleEl.textContent = searchbarUtils ? searchbarUtils.getRealTitle(displayTitle) : displayTitle
    favTitle.appendChild(titleEl)
    info.appendChild(favTitle)

    // Meta: Bucket badge + domain
    const meta = document.createElement('div')
    meta.className = 'overview-card-meta'

    const badge = document.createElement('span')
    badge.className = 'overview-card-bucket-badge'
    badge.textContent = task.name || (typeof l === 'function' ? l('defaultTaskName').replace('%n', '') : 'Bucket')
    meta.appendChild(badge)

    const domainEl = document.createElement('span')
    domainEl.className = 'overview-card-domain'
    const domain = tab.url ? urlParser.basicURL(urlParser.getSourceURL(tab.url)) : ''
    domainEl.textContent = domain
    meta.appendChild(domainEl)

    info.appendChild(meta)
    card.appendChild(info)

    // Click handler
    card.addEventListener('click', function (e) {
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
        if (events.onTabSelect) {
          events.onTabSelect(tab.id, task.id)
        }
      }
    })

    // Middle-click to close
    card.addEventListener('auxclick', function (e) {
      if (e.button === 1) {
        e.preventDefault()
        e.stopPropagation()
        if (events.onTabClose) {
          events.onTabClose(tab.id, card)
        }
      }
    })

    return card
  },

  createBucketSection: function (task, taskIndex, events) {
    const section = document.createElement('div')
    section.className = 'overview-bucket-section'
    section.setAttribute('data-bucket', task.id)

    if (tasks.isCollapsed && tasks.isCollapsed(task.id)) {
      section.classList.add('collapsed')
    }

    // Sticky Header
    const header = document.createElement('div')
    header.className = 'overview-bucket-header'

    const collapseBtn = document.createElement('button')
    collapseBtn.className = 'overview-bucket-collapse i carbon:chevron-down'
    collapseBtn.title = 'Toggle collapse'
    collapseBtn.setAttribute('tabindex', '-1')
    collapseBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      section.classList.toggle('collapsed')
    })
    header.appendChild(collapseBtn)

    const defaultName = typeof l === 'function' ? l('defaultTaskName').replace('%n', taskIndex + 1) : `Bucket ${taskIndex + 1}`
    const titleInput = document.createElement('input')
    titleInput.className = 'overview-bucket-title'
    titleInput.value = task.name || defaultName
    titleInput.placeholder = defaultName
    titleInput.spellcheck = false

    titleInput.addEventListener('keyup', function (e) {
      if (e.keyCode === 13) {
        this.blur()
      }
      tasks.update(task.id, { name: this.value })
    })
    header.appendChild(titleInput)

    const tabCount = task.tabs ? task.tabs.count() : 0
    const countBadge = document.createElement('span')
    countBadge.className = 'overview-bucket-count'
    countBadge.textContent = `${tabCount} tab${tabCount === 1 ? '' : 's'}`
    header.appendChild(countBadge)

    const actions = document.createElement('div')
    actions.className = 'overview-bucket-actions'

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'overview-bucket-delete i carbon:trash-can'
    deleteBtn.title = 'Delete bucket'
    deleteBtn.setAttribute('tabindex', '-1')
    deleteBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      if (events.onBucketDelete) {
        events.onBucketDelete(task.id, section)
      }
    })
    actions.appendChild(deleteBtn)
    header.appendChild(actions)

    section.appendChild(header)

    // Masonry Grid Container
    const grid = document.createElement('div')
    grid.className = 'overview-masonry-grid'
    grid.setAttribute('data-bucket', task.id)
    section.appendChild(grid)

    return {
      element: section,
      grid: grid,
      countBadge: countBadge
    }
  },

  layoutMasonry: function (gridEl, cards, containerWidth) {
    gridEl.innerHTML = ''
    const width = containerWidth || (gridEl.parentElement ? gridEl.parentElement.offsetWidth : 960) || 960
    const colCount = Math.max(1, Math.min(5, Math.floor(width / 280)))

    const columns = []
    const colHeights = new Array(colCount).fill(0)

    for (let i = 0; i < colCount; i++) {
      const col = document.createElement('div')
      col.className = 'overview-column'
      col.setAttribute('data-col', i)
      columns.push(col)
      gridEl.appendChild(col)
    }

    cards.forEach(function (card) {
      let minCol = 0
      for (let i = 1; i < colCount; i++) {
        if (colHeights[i] < colHeights[minCol]) {
          minCol = i
        }
      }
      columns[minCol].appendChild(card)
      // Estimated height: ~210px base
      colHeights[minCol] += 210
    })

    return columns
  },

  createNewBucketTarget: function (onClick) {
    const target = document.createElement('div')
    target.className = 'overview-new-bucket-target'
    target.id = 'overview-new-bucket-target'

    const icon = document.createElement('i')
    icon.className = 'i carbon:new-tab'
    target.appendChild(icon)

    const label = document.createElement('span')
    label.textContent = typeof l === 'function' ? l('newTask') : 'New Bucket'
    target.appendChild(label)

    target.addEventListener('click', function () {
      if (onClick) {
        onClick()
      }
    })

    return target
  }
}

module.exports = overviewBuilder
