/* container manager page. Sandbox page: all data goes through the postMessage preload bridge. */

document.title = l('containersPageTitle') + ' | xb'

/* Firefox container icon names mapped to Min's carbon icon font */
const CARBON_ICONS = {
  fingerprint: 'carbon:fingerprint-recognition',
  briefcase: 'carbon:enterprise',
  dollar: 'carbon:currency-dollar',
  cart: 'carbon:shopping-cart',
  vacation: 'carbon:plane',
  gift: 'carbon:gift',
  food: 'carbon:restaurant',
  fruit: 'carbon:fruit-bowl',
  pet: 'carbon:dog-walker',
  tree: 'carbon:tree',
  chill: 'carbon:face-cool',
  circle: 'carbon:circle-dash',
  fence: 'carbon:border-full'
}

var state = {
  containers: [],
  counts: {},
  colors: {},
  icons: [],
  editing: null, // null | { id: null } for a new container | { id }
  armedDeleteId: null
}

var requestCounter = 0
var pendingRequests = {}

function callMain (op, args) {
  return new Promise(function (resolve, reject) {
    requestCounter++
    pendingRequests[requestCounter] = { resolve, reject }
    window.postMessage({ message: 'containersPage:' + op, id: requestCounter, args: args }, window.location.toString())
  })
}

window.addEventListener('message', function (e) {
  if (!e.data || typeof e.data.message !== 'string') {
    return
  }
  if (e.data.message === 'containersPage:result') {
    var request = pendingRequests[e.data.id]
    if (request) {
      delete pendingRequests[e.data.id]
      if (e.data.error) {
        request.reject(new Error(e.data.error))
      } else {
        request.resolve(e.data.result)
      }
    }
  } else if (e.data.message === 'containersPage:changed') {
    state.containers = e.data.list
    refreshCounts().then(render)
  }
})

function refreshCounts () {
  return callMain('tabCounts').then(function (counts) {
    state.counts = counts || {}
  })
}

function carbonClass (name) {
  return CARBON_ICONS[name] || 'carbon:circle-dash'
}

/* list */

function render () {
  var listNode = document.getElementById('container-list')
  listNode.textContent = ''

  state.containers.forEach(function (container) {
    listNode.appendChild(buildRow(container))
  })
}

function buildRow (container) {
  var row = document.createElement('div')
  row.className = 'container-row' + (state.armedDeleteId === container.id ? ' armed' : '')

  var dot = document.createElement('span')
  dot.className = 'container-dot'
  dot.style.backgroundColor = container.color
  row.appendChild(dot)

  var icon = document.createElement('i')
  icon.className = 'i container-icon ' + carbonClass(container.icon)
  row.appendChild(icon)

  var name = document.createElement('span')
  name.className = 'container-name'
  name.textContent = container.name
  row.appendChild(name)

  if (container.builtIn) {
    var badge = document.createElement('span')
    badge.className = 'container-default-badge'
    badge.textContent = l('containersDefaultLabel')
    row.appendChild(badge)
  }

  var count = document.createElement('span')
  count.className = 'container-count'
  count.textContent = l('containersOpenTabs').replace('%n', state.counts[container.id] || 0)
  row.appendChild(count)

  var editButton = document.createElement('button')
  editButton.textContent = l('containersEdit')
  editButton.addEventListener('click', function () {
    state.armedDeleteId = null
    showEditor({ id: container.id })
  })
  row.appendChild(editButton)

  if (!container.builtIn) {
    var deleteButton = document.createElement('button')
    if (state.armedDeleteId === container.id) {
      deleteButton.textContent = l('containersDeleteConfirm')
    } else {
      deleteButton.textContent = l('containersDelete')
      deleteButton.title = l('containersDeleteWarning').replace('%s', container.name)
    }
    deleteButton.addEventListener('click', function () {
      if (state.armedDeleteId === container.id) {
        state.armedDeleteId = null
        callMain('remove', { id: container.id }).catch(function (err) {
          console.warn('failed to remove container', err)
        })
      } else {
        state.armedDeleteId = container.id
        render()
      }
    })
    row.appendChild(deleteButton)
  }

  return row
}

/* editor */

function selectedEditorContainer () {
  if (!state.editing || !state.editing.id) {
    return null
  }
  return state.containers.find(c => c.id === state.editing.id) || null
}

function showEditor (target) {
  state.editing = target
  state.armedDeleteId = null

  var container = selectedEditorContainer()
  var nameInput = document.getElementById('container-name-input')
  nameInput.value = container ? container.name : ''

  document.getElementById('editor-heading').textContent = container ? l('containersEditorEdit') : l('containersEditorNew')
  document.getElementById('editor-save').textContent = l('containersSave')
  document.getElementById('editor-cancel').textContent = l('containersCancel')

  renderColorPicker(container ? container.color : state.colors.blue || '#37adff')
  renderIconPicker(container ? container.icon : 'circle')

  document.getElementById('container-editor').hidden = false
  nameInput.focus()
}

function hideEditor () {
  state.editing = null
  document.getElementById('container-editor').hidden = true
}

function currentEditorSelection () {
  var colorChoice = document.querySelector('#color-picker button.selected')
  var iconChoice = document.querySelector('#icon-picker button.selected')
  return {
    color: colorChoice ? colorChoice.dataset.color : null,
    icon: iconChoice ? iconChoice.dataset.icon : null
  }
}

function renderColorPicker (selectedColor) {
  var picker = document.getElementById('color-picker')
  picker.textContent = ''

  Object.keys(state.colors).forEach(function (name) {
    var color = state.colors[name]
    var button = document.createElement('button')
    button.className = 'color-choice' + (color === selectedColor ? ' selected' : '')
    button.style.backgroundColor = color
    button.style.color = color
    button.dataset.color = color
    button.setAttribute('aria-label', name)
    button.addEventListener('click', function () {
      picker.querySelectorAll('button').forEach(function (b) {
        b.classList.remove('selected')
      })
      button.classList.add('selected')
    })
    picker.appendChild(button)
  })
}

function renderIconPicker (selectedIcon) {
  var picker = document.getElementById('icon-picker')
  picker.textContent = ''

  state.icons.forEach(function (name) {
    var button = document.createElement('button')
    button.className = 'icon-choice' + (name === selectedIcon ? ' selected' : '')
    button.dataset.icon = name
    button.setAttribute('aria-label', name)
    var icon = document.createElement('i')
    icon.className = 'i ' + carbonClass(name)
    button.appendChild(icon)
    button.addEventListener('click', function () {
      picker.querySelectorAll('button').forEach(function (b) {
        b.classList.remove('selected')
      })
      button.classList.add('selected')
    })
    picker.appendChild(button)
  })
}

function saveEditor () {
  var name = document.getElementById('container-name-input').value.trim()
  if (!name) {
    document.getElementById('container-name-input').focus()
    return
  }
  var selection = currentEditorSelection()
  var data = { name: name, color: selection.color, icon: selection.icon }

  var request
  if (state.editing && state.editing.id) {
    request = callMain('update', { id: state.editing.id, data: data })
  } else {
    request = callMain('add', data)
  }
  request.then(hideEditor).catch(function (err) {
    console.warn('failed to save container', err)
  })
}

document.getElementById('new-container-button').addEventListener('click', function () {
  showEditor({ id: null })
})
document.getElementById('editor-save').addEventListener('click', saveEditor)
document.getElementById('editor-cancel').addEventListener('click', hideEditor)
document.getElementById('container-name-input').addEventListener('keypress', function (e) {
  if (e.key === 'Enter') {
    saveEditor()
  }
})

/* boot */

callMain('vocabulary').then(function (vocab) {
  state.colors = vocab.colors
  state.icons = vocab.icons
  return callMain('list').then(function (list) {
    state.containers = list
    return refreshCounts()
  }).then(render)
})
