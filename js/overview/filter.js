const containers = require('containers.js')
const overview = require('overview/overview.js')

function matches (tab, task) {
  if (overview.containerFilter && containers.sanitizeContainerId(tab.containerId) !== overview.containerFilter) {
    return false
  }
  if (!overview.query) {
    return true
  }
  const container = containers.get(tab.containerId)
  const haystack = [tab.title, tab.url, task.name, container && container.name].join(' ').toLowerCase()
  return overview.query.split(/\s+/).every(word => haystack.includes(word))
}

function renderChips () {
  const used = new Set()
  tasks.forEach(task => task.tabs.get().forEach(tab => used.add(containers.sanitizeContainerId(tab.containerId))))
  const list = containers.list().filter(c => used.has(c.id))
  overview.chips.textContent = ''
  if (list.length < 2) {
    overview.containerFilter = null
    return
  }
  const all = [{ id: null, name: l('allTabs') }].concat(list)
  all.forEach(function (container) {
    const chip = document.createElement('button')
    chip.className = 'ov-chip' + (overview.containerFilter === container.id ? ' active' : '')
    if (container.color) {
      chip.style.setProperty('--chip-color', container.color)
    }
    chip.textContent = container.name
    chip.addEventListener('click', function () {
      overview.containerFilter = container.id
      overview.renderChips()
      overview.relayout()
    })
    overview.chips.appendChild(chip)
  })
}

module.exports = { matches, renderChips }
