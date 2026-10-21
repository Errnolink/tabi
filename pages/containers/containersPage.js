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
  defaultId: 'default',
  counts: {},
  colors: {},
  icons: [],
  editing: null, // null | { id: null } for a new container | { id }
  armedDeleteId: null,
  armedClearId: null,
  moveTargetId: null // chosen successor while the delete-default picker is open
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
    state.containers = e.data.state.containers
    state.defaultId = e.data.state.defaultId
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
  var main = document.querySelector('.containers-main')
  var editor = document.getElementById('container-editor')
  var listNode = document.getElementById('container-list')
  if (editor && editor.parentNode === listNode) {
    main.appendChild(editor)
  }
  var picker = document.getElementById('delete-picker')
  if (picker && picker.parentNode === listNode) {
    main.appendChild(picker)
  }
  listNode.textContent = ''

  state.containers.forEach(function (container, index) {
    var row = buildRow(container)
    row.style.setProperty('--i', index)
    listNode.appendChild(row)
  })
}

function buildRow (container) {
  var isDefault = state.defaultId === container.id
  var row = document.createElement('div')
  row.className = 'container-row pebble-card' +
    (state.armedDeleteId === container.id || state.armedClearId === container.id ? ' armed' : '') +
    (isDefault ? ' is-default' : '')
  row.dataset.containerId = container.id
  row.style.setProperty('--container-color', container.color)

  var dot = document.createElement('span')
  dot.className = 'container-dot color-pebble'
  dot.style.backgroundColor = container.color
  dot.style.setProperty('--container-color', container.color)
  row.appendChild(dot)

  var icon = document.createElement('i')
  icon.className = 'i container-icon ' + carbonClass(container.icon)
  row.appendChild(icon)

  var name = document.createElement('span')
  name.className = 'container-name'
  name.textContent = container.name
  row.appendChild(name)

  if (isDefault) {
    var badge = document.createElement('span')
    badge.className = 'container-default-badge'
    badge.textContent = l('containersDefaultLabel')
    row.appendChild(badge)
  }

  var count = document.createElement('span')
  count.className = 'container-count'
  count.textContent = l('containersOpenTabs').replace('%n', state.counts[container.id] || 0)
  row.appendChild(count)

  if (!isDefault) {
    var makeDefaultButton = document.createElement('button')
    makeDefaultButton.className = 'container-default-btn btn-tonal'
    makeDefaultButton.textContent = l('containersMakeDefault')
    makeDefaultButton.addEventListener('click', function () {
      state.armedDeleteId = null
      state.armedClearId = null
      callMain('setDefault', { id: container.id }).catch(function (err) {
        console.warn('failed to set default container', err)
      })
    })
    row.appendChild(makeDefaultButton)
  }

  var clearButton = document.createElement('button')
  clearButton.className = 'container-clear-btn' + (state.armedClearId === container.id ? ' chip-coral armed' : ' btn-tonal')
  if (state.armedClearId === container.id) {
    clearButton.textContent = l('containersClearConfirm')
  } else {
    clearButton.textContent = l('containersClearData')
    clearButton.title = l('containersClearWarning').replace('%s', container.name)
  }
  clearButton.addEventListener('click', function () {
    if (state.armedClearId === container.id) {
      state.armedClearId = null
      callMain('clear', { id: container.id }).catch(function (err) {
        console.warn('failed to clear container data', err)
      })
      render()
    } else {
      state.armedClearId = container.id
      state.armedDeleteId = null
      render()
    }
  })
  row.appendChild(clearButton)

  var editButton = document.createElement('button')
  editButton.className = 'container-edit-btn btn-tonal'
  editButton.textContent = l('containersEdit')
  editButton.addEventListener('click', function () {
    state.armedDeleteId = null
    state.armedClearId = null
    showEditor({ id: container.id })
  })
  row.appendChild(editButton)

  if (isDefault) {
    if (state.containers.length >= 2) {
      var deleteDefaultButton = document.createElement('button')
      deleteDefaultButton.className = 'container-delete-btn chip-coral'
      deleteDefaultButton.textContent = l('containersDelete')
      deleteDefaultButton.title = l('containersDeleteWarning').replace('%s', container.name)
      deleteDefaultButton.addEventListener('click', function () {
        openDeletePicker(container)
      })
      row.appendChild(deleteDefaultButton)
    }
  } else {
    var deleteButton = document.createElement('button')
    deleteButton.className = 'container-delete-btn chip-coral' + (state.armedDeleteId === container.id ? ' armed' : '')
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
        state.armedClearId = null
        render()
      }
    })
    row.appendChild(deleteButton)
  }

  return row
}

/* delete-default picker: choose which container inherits the tabs and the default role */

function otherContainers () {
  return state.containers.filter(c => c.id !== state.armedDeleteId)
}

function openDeletePicker (container) {
  state.editing = null
  hideEditor()
  state.armedClearId = null
  state.armedDeleteId = container.id

  var others = otherContainers()
  if (!others.some(c => c.id === state.moveTargetId)) {
    state.moveTargetId = others[0].id
  }

  var picker = document.getElementById('delete-picker')
  document.getElementById('delete-picker-heading').textContent = l('containersDeleteDefaultTitle').replace('%s', container.name)
  document.getElementById('delete-picker-desc').textContent = l('containersDeleteDefaultPrompt')
  document.getElementById('delete-picker-cancel').textContent = l('containersCancel')
  document.getElementById('delete-picker-confirm').textContent = l('containersDeleteDefaultConfirm')

  var chipList = document.getElementById('delete-choice-list')
  chipList.textContent = ''
  others.forEach(function (other) {
    var chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'delete-choice-chip' + (other.id === state.moveTargetId ? ' selected' : '')
    chip.dataset.containerId = other.id

    var choiceDot = document.createElement('span')
    choiceDot.className = 'delete-choice-dot'
    choiceDot.style.backgroundColor = other.color
    chip.appendChild(choiceDot)

    var choiceIcon = document.createElement('i')
    choiceIcon.className = 'i ' + carbonClass(other.icon)
    chip.appendChild(choiceIcon)

    var choiceName = document.createElement('span')
    choiceName.textContent = other.name
    chip.appendChild(choiceName)

    chip.addEventListener('click', function () {
      state.moveTargetId = other.id
      chipList.querySelectorAll('.delete-choice-chip').forEach(function (c) {
        c.classList.remove('selected')
      })
      chip.classList.add('selected')
    })
    chipList.appendChild(chip)
  })

  var row = document.querySelector('[data-container-id="' + container.id + '"]')
  if (row && row.parentNode) {
    row.after(picker)
  } else {
    document.getElementById('container-list').before(picker)
  }
  picker.hidden = false
}

function hideDeletePicker () {
  state.armedDeleteId = null
  state.moveTargetId = null
  document.getElementById('delete-picker').hidden = true
}

/* editor */

function selectedEditorContainer () {
  if (!state.editing || !state.editing.id) {
    return null
  }
  return state.containers.find(c => c.id === state.editing.id) || null
}

function updateEditorPreviewDot (color) {
  var dot = document.getElementById('editor-preview-dot')
  if (dot) {
    dot.style.backgroundColor = color
    dot.style.setProperty('--preview-color', color)
  }
}

function showEditor (target) {
  state.editing = target
  state.armedDeleteId = null
  hideDeletePicker()
  var container = selectedEditorContainer()
  var nameInput = document.getElementById('container-name-input')
  nameInput.value = container ? container.name : ''

  document.getElementById('editor-heading').textContent = container ? l('containersEditorEdit') : l('containersEditorNew')
  document.getElementById('editor-save').textContent = l('containersSave')
  document.getElementById('editor-cancel').textContent = l('containersCancel')

  var currentColor = container ? container.color : (state.colors.blue || '#37adff')
  updateEditorPreviewDot(currentColor)

  renderColorPicker(currentColor)
  renderIconPicker(container ? container.icon : 'circle')

  var editor = document.getElementById('container-editor')
  var listNode = document.getElementById('container-list')

  if (target && target.id) {
    var row = document.querySelector('[data-container-id="' + target.id + '"]')
    if (row && row.parentNode) {
      row.after(editor)
    } else {
      listNode.before(editor)
    }
  } else {
    listNode.before(editor)
  }

  editor.hidden = false
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
    button.type = 'button'
    button.className = 'color-pebble-choice' + (color === selectedColor ? ' selected' : '')
    button.style.backgroundColor = color
    button.style.setProperty('--swatch-color', color)
    button.dataset.color = color
    button.setAttribute('aria-label', name)
    button.title = name
    button.addEventListener('click', function () {
      picker.querySelectorAll('button').forEach(function (b) {
        b.classList.remove('selected')
      })
      button.classList.add('selected')
      updateEditorPreviewDot(color)
    })
    picker.appendChild(button)
  })
}

function renderIconPicker (selectedIcon) {
  var picker = document.getElementById('icon-picker')
  picker.textContent = ''

  state.icons.forEach(function (name) {
    var button = document.createElement('button')
    button.type = 'button'
    button.className = 'icon-chip-choice' + (name === selectedIcon ? ' selected' : '')
    button.dataset.icon = name
    button.setAttribute('aria-label', name)
    button.title = name
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
var closeBtn = document.getElementById('editor-close-btn')
if (closeBtn) {
  closeBtn.addEventListener('click', hideEditor)
}
var deleteCancelBtn = document.getElementById('delete-picker-cancel')
if (deleteCancelBtn) {
  deleteCancelBtn.addEventListener('click', hideDeletePicker)
}
var deleteConfirmBtn = document.getElementById('delete-picker-confirm')
if (deleteConfirmBtn) {
  deleteConfirmBtn.addEventListener('click', function () {
    if (!state.armedDeleteId || !state.moveTargetId) {
      return
    }
    var id = state.armedDeleteId
    var moveTarget = state.moveTargetId
    hideDeletePicker()
    callMain('remove', { id: id, moveTargetId: moveTarget }).catch(function (err) {
      console.warn('failed to remove default container', err)
    })
  })
}
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
