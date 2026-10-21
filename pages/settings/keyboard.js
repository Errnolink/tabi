settings.get('keyMap', function (keyMapSettings) {
  var keyMap = userKeyMap(keyMapSettings)
  var keyMapList = document.getElementById('key-map-list')
  if (!keyMapList) return

  Object.keys(keyMap).forEach(function (action) {
    var li = createKeyMapListItem(action, keyMap)
    keyMapList.appendChild(li)
  })
})

function formatCamelCase (text) {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function createKeyMapListItem (action, keyMap) {
  var li = document.createElement('li')
  var label = document.createElement('label')
  var input = document.createElement('input')
  input.className = 'key-chip-input'
  input.autocomplete = 'off'
  input.spellcheck = false

  label.textContent = formatCamelCase(action)
  label.setAttribute('for', action)
  input.id = action
  input.name = action
  input.value = formatKeyValue(keyMap[action])

  input.addEventListener('change', onKeyMapChange)

  li.appendChild(label)
  li.appendChild(input)

  return li
}

function formatKeyValue (value) {
  if (!value) return ''
  if (Array.isArray(value)) {
    value = value.join(', ')
  }
  if (navigator.platform === 'MacIntel') {
    value = value.replace(/\bmod\b/g, 'command')
  } else {
    value = value.replace(/\bmod\b/g, 'ctrl')
  }
  if (navigator.platform === 'Win32') {
    value = value.replace(/\bsuper\b/g, 'win')
  }
  return value
}

function parseKeyInput (input) {
  if (!input) return null
  var parsed = input.toLowerCase().split(',').map(function (k) { return k.trim() })
  parsed = parsed.map(function (e) {
    if (navigator.platform === 'MacIntel') {
      e = e.replace(/\b(command)|(cmd)\b/g, 'mod')
    } else {
      e = e.replace(/\b(control)|(ctrl)\b/g, 'mod')
    }
    if (navigator.platform === 'Win32') {
      e = e.replace(/\bwin\b/g, 'super')
    }
    return e
  })
  if (parsed.length === 1) {
    return parsed[0]
  }
  return parsed
}

function onKeyMapChange (e) {
  var action = this.name
  var newValue = this.value

  settings.get('keyMap', function (keyMapSettings) {
    keyMapSettings = keyMapSettings || {}
    keyMapSettings[action] = parseKeyInput(newValue)
    settings.set('keyMap', keyMapSettings)
    showRestartRequiredBanner()
  })
}
