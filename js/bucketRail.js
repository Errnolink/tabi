var browserUI = require('browserUI.js')

var RAIL_WIDTH = 240

function bucketName (task, index) {
  return task.name || l('defaultTaskName').replace('%n', index + 1)
}

function render () {
  var rail = document.getElementById('bucket-rail')
  if (!rail) {
    return
  }
  rail.innerHTML = ''
  var selected = tasks.getSelected()
  tasks.forEach(function (task, index) {
    var group = document.createElement('div')
    group.className = 'rail-bucket' + (selected && task.id === selected.id ? ' active' : '')

    var head = document.createElement('div')
    head.className = 'rail-bucket-name'
    head.textContent = bucketName(task, index)
    head.addEventListener('click', function () {
      browserUI.switchToTask(task.id)
    })
    group.appendChild(head)

    task.tabs.get().forEach(function (tab) {
      var row = document.createElement('div')
      var isActive = selected && task.id === selected.id && tab.id === selected.tabs.getSelected()
      row.className = 'rail-tab' + (isActive ? ' active-tab' : '')
      row.textContent = tab.title || tab.url || 'New tab'
      row.title = tab.url || ''
      row.addEventListener('click', function () {
        browserUI.switchToTask(task.id)
        browserUI.switchToTab(tab.id)
      })
      group.appendChild(row)
    })

    rail.appendChild(group)
  })
}

function initialize () {
  document.body.classList.add('rail-on')
  var events = ['task-added', 'task-removed', 'task-updated', 'tab-added', 'tab-removed', 'tab-updated', 'tab-selected']
  events.forEach(function (name) {
    tasks.on(name, function () {
      render()
    })
  })
  render()
}

module.exports = { initialize, RAIL_WIDTH }
