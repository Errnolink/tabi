var autoFileList = document.getElementById('autofile-rules')
var autoFileAddBtn = document.getElementById('btn-autofile-add')
var autoFilePresetBtn = document.getElementById('btn-autofile-x-preset')

var AUTOFILE_X_PRESET = [
  { name: 'Home', patterns: ['x.com/home', 'x.com/notifications', 'x.com/messages', 'x.com/i/'] },
  { name: 'Search', patterns: ['x.com/search', 'x.com/explore'] },
  { name: 'Reading', patterns: ['x.com/', 'twitter.com/'] }
]

function updateAutoFilePresetButton (rules) {
  if (autoFilePresetBtn) {
    autoFilePresetBtn.disabled = AUTOFILE_X_PRESET.every(function (preset) {
      return (rules || []).some(function (rule) {
        return rule.name === preset.name
      })
    })
  }
}

function createAutoFileRule (rule) {
  var current = { name: rule.name, patterns: rule.patterns.slice() }

  var li = document.createElement('li')
  var nameInput = document.createElement('input')
  var patternsInput = document.createElement('input')
  var deleteButton = document.createElement('button')

  nameInput.className = 'settings-text-input'
  patternsInput.className = 'settings-text-input autofile-patterns-input'
  deleteButton.className = 'custom-bang-delete-button'

  nameInput.value = rule.name
  nameInput.placeholder = l('settingsAutoFileGroupName')
  nameInput.autocomplete = 'off'
  nameInput.spellcheck = false

  patternsInput.value = rule.patterns.join(', ')
  patternsInput.placeholder = l('settingsAutoFilePrefixes')
  patternsInput.autocomplete = 'off'
  patternsInput.spellcheck = false

  deleteButton.setAttribute('type', 'button')
  deleteButton.innerHTML = '<i class="i carbon:trash-can"></i>'

  var saveTimer = null
  function update (key, value) {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(function () {
      settings.get('autoFileRules', function (stored) {
        var rules = (stored || []).slice()
        var index = rules.findIndex(function (r) {
          return r.name === current.name.trim()
        })
        current[key] = value
        var name = current.name.trim()
        var patterns = current.patterns.map(function (p) {
          return p.trim()
        }).filter(Boolean)
        var rule = (name && patterns.length > 0) ? { name: name, patterns: patterns } : null
        if (index >= 0) {
          if (rule) {
            rules.splice(index, 1, rule)
          } else {
            rules.splice(index, 1)
          }
        } else if (rule) {
          rules.push(rule)
        }
        settings.set('autoFileRules', rules)
        updateAutoFilePresetButton(rules)
      })
    }, 350)
  }

  nameInput.addEventListener('input', function () {
    update('name', nameInput.value)
  })
  patternsInput.addEventListener('input', function () {
    update('patterns', patternsInput.value.split(','))
  })

  deleteButton.addEventListener('click', function () {
    li.remove()
    settings.get('autoFileRules', function (stored) {
      var filtered = (stored || []).filter(function (r) {
        return r.name !== current.name
      })
      settings.set('autoFileRules', filtered)
      updateAutoFilePresetButton(filtered)
    })
  })

  li.appendChild(nameInput)
  li.appendChild(patternsInput)
  li.appendChild(deleteButton)
  return li
}

function renderAutoFileRules (rules) {
  if (!autoFileList) {
    return
  }
  autoFileList.textContent = ''
  ;(rules || []).forEach(function (rule) {
    autoFileList.appendChild(createAutoFileRule(rule))
  })
  updateAutoFilePresetButton(rules)
}

if (autoFileList) {
  settings.get('autoFileRules', function (rules) {
    renderAutoFileRules(rules || [])
  })
}

if (autoFileAddBtn) {
  autoFileAddBtn.addEventListener('click', function () {
    settings.get('autoFileRules', function (stored) {
      var rules = (stored || []).slice()
      var baseName = l('settingsAutoFileNewGroup')
      var name = baseName
      var n = 2
      while (rules.some(function (r) {
        return r.name === name
      })) {
        name = baseName + ' ' + n
        n++
      }
      rules.push({ name: name, patterns: ['example.com/'] })
      settings.set('autoFileRules', rules)
      renderAutoFileRules(rules)
    })
  })
}

if (autoFilePresetBtn) {
  autoFilePresetBtn.addEventListener('click', function () {
    settings.get('autoFileRules', function (stored) {
      var rules = (stored || []).slice()
      AUTOFILE_X_PRESET.forEach(function (preset) {
        var exists = rules.some(function (rule) {
          return rule.name === preset.name
        })
        if (!exists) {
          rules.push({ name: preset.name, patterns: preset.patterns.slice() })
        }
      })
      settings.set('autoFileRules', rules)
      renderAutoFileRules(rules)
    })
  })
}
