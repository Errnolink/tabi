const browserUI = require('browserUI.js')
const containers = require('containers.js')
const shellLayout = require('shellLayout.js')
const util = require('overview/util.js')
const overview = require('overview/overview.js')

function columnCount () {
  const width = overview.content.clientWidth - 48
  return Math.max(1, Math.floor((width + util.GAP) / (util.MIN_COLUMN + util.GAP)))
}

function relayout () {
  if (util.reduceMotion.matches) {
    overview.render()
    return
  }
  const before = new Map()
  overview.el.querySelectorAll('.ov-card').forEach(card => before.set(card.dataset.tab, card.getBoundingClientRect()))
  const headsBefore = new Map()
  overview.el.querySelectorAll('.ov-bucket').forEach(section => headsBefore.set(section.dataset.task, section.getBoundingClientRect().top))
  overview.render()
  overview.el.querySelectorAll('.ov-card').forEach(function (card) {
    const old = before.get(card.dataset.tab)
    if (!old) {
      card.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: util.motion.spatialFast })
      return
    }
    const now = card.getBoundingClientRect()
    const dx = old.left - now.left
    const dy = old.top - now.top
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      card.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: util.motion.spatial })
    }
  })
  overview.el.querySelectorAll('.ov-bucket').forEach(function (section) {
    const old = headsBefore.get(section.dataset.task)
    if (old === undefined) {
      section.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: util.motion.effects })
      return
    }
    const dy = old - section.getBoundingClientRect().top
    if (Math.abs(dy) > 0.5) {
      section.querySelector('.ov-bucket-head').animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: util.motion.spatial })
    }
  })
}

function render () {
  if (!overview.el) {
    return
  }
  const focusedTab = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tab : null
  const columns = overview.columnCount()
  overview.lastColumns = columns
  overview.renderChips()
  overview.content.textContent = ''
  const filtering = !!(overview.query || overview.containerFilter)

  let cardIndex = 0
  let shown = 0
  const selectedTab = tabs.getSelected()
  tasks.forEach(function (task, index) {
    const visible = task.tabs.get().filter(tab => overview.matches(tab, task))
    if (filtering && !visible.length) {
      return
    }
    shown += visible.length
    const section = document.createElement('section')
    section.className = 'ov-bucket'
    section.dataset.task = task.id
    section.style.setProperty('--bucket-hue', shellLayout.bucketHue(index))

    const head = document.createElement('div')
    head.className = 'ov-bucket-head'
    const dot = document.createElement('span')
    dot.className = 'ov-dot'
    const name = document.createElement('span')
    name.className = 'ov-bucket-name'
    name.textContent = task.name || l('defaultTaskName').replace('%n', index + 1)
    const count = document.createElement('span')
    count.className = 'ov-count'
    count.textContent = filtering ? visible.length + ' / ' + task.tabs.count() : task.tabs.count()
    const add = document.createElement('button')
    add.className = 'ov-add i carbon:add'
    add.title = util.withShortcut(l('newTabInGroup'), 'addTab')
    add.addEventListener('click', function () {
      browserUI.switchToTask(task.id)
      browserUI.addTab(tabs.add({ containerId: containers.containerForNewTab(task.id) }), { enterEditMode: false })
      overview.hide(tabs.getSelected())
    })
    head.append(dot, name, count, add)

    const grid = document.createElement('div')
    grid.className = 'ov-grid'
    const cols = []
    const heights = []
    for (let i = 0; i < columns; i++) {
      const col = document.createElement('div')
      col.className = 'ov-col'
      grid.appendChild(col)
      cols.push(col)
      heights.push(0)
    }
    visible.forEach(function (tab) {
      const card = overview.createCard(tab, task, cardIndex++)
      if (tab.id === selectedTab) {
        card.classList.add('current')
      }
      let shortest = 0
      for (let i = 1; i < columns; i++) {
        if (heights[i] < heights[shortest] - 0.01) {
          shortest = i
        }
      }
      cols[shortest].appendChild(card)
      heights[shortest] += card._estimate
    })

    section.append(head, grid)
    overview.makeDropTarget(section, task.id)
    overview.content.appendChild(section)
  })

  if (filtering && !shown) {
    const empty = document.createElement('div')
    empty.className = 'ov-empty'
    empty.textContent = l('noTabsMatch')
    overview.content.appendChild(empty)
  }

  const newZone = document.createElement('div')
  newZone.className = 'ov-new-zone'
  newZone.textContent = l('dropToCreateBucket')
  overview.makeDropTarget(newZone, null)
  overview.content.appendChild(newZone)

  if (focusedTab) {
    const again = overview.cardFor(focusedTab)
    if (again) {
      again.focus({ preventScroll: true })
    }
  }
}

module.exports = { columnCount, relayout, render }
