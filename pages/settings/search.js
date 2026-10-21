var searchEngineDropdown = document.getElementById('default-search-engine')
var searchEngineInput = document.getElementById('custom-search-engine')

if (searchEngineInput) {
  searchEngineInput.setAttribute('placeholder', l('customSearchEngineDescription'))
}

if (searchEngineDropdown) {
  settings.onLoad(function () {
    for (var engine in searchEngines) {
      var opt = document.createElement('option')
      opt.textContent = searchEngines[engine].name
      opt.value = engine
      searchEngineDropdown.appendChild(opt)
    }

    var customOpt = document.createElement('option')
    customOpt.textContent = 'custom'
    customOpt.value = 'custom'
    searchEngineDropdown.appendChild(customOpt)

    settings.get('searchEngine', function (value) {
      if (value && value.name) {
        searchEngineDropdown.value = value.name
      } else if (value && value.url) {
        searchEngineDropdown.value = 'custom'
        if (searchEngineInput) {
          searchEngineInput.value = value.url
          searchEngineInput.hidden = false
        }
      } else {
        searchEngineDropdown.value = 'DuckDuckGo'
      }
    })
  })

  searchEngineDropdown.addEventListener('change', function () {
    if (this.value === 'custom') {
      if (searchEngineInput) searchEngineInput.hidden = false
    } else {
      if (searchEngineInput) searchEngineInput.hidden = true
      settings.set('searchEngine', { name: this.value })
    }
  })

  if (searchEngineInput) {
    searchEngineInput.addEventListener('input', function () {
      settings.set('searchEngine', { url: this.value })
    })
  }
}

settings.get('customBangs', function (value) {
  var bangslist = document.getElementById('custom-bangs')
  if (bangslist && value) {
    value.forEach(function (bang) {
      createBang(bang.phrase, bang.snippet, bang.redirect)
    })
  }
})

var addCustomBangBtn = document.getElementById('add-custom-bang')
if (addCustomBangBtn) {
  addCustomBangBtn.addEventListener('click', function () {
    createBang('', '', '')
    showRestartRequiredBanner()
  })
}

function createBang (bang, snippet, redirect) {
  var current = { phrase: bang, snippet: snippet, redirect: redirect }
  var bangslist = document.getElementById('custom-bangs')
  if (!bangslist) return

  var li = document.createElement('li')
  var bangInput = document.createElement('input')
  var snippetInput = document.createElement('input')
  var redirectInput = document.createElement('input')
  var deleteButton = document.createElement('button')

  bangInput.className = 'settings-text-input'
  snippetInput.className = 'settings-text-input'
  redirectInput.className = 'settings-text-input'
  deleteButton.className = 'custom-bang-delete-button'

  bangInput.value = bang
  bangInput.placeholder = l('settingsCustomBangsPhrase')
  bangInput.autocomplete = 'off'
  bangInput.spellcheck = false

  snippetInput.value = snippet
  snippetInput.placeholder = l('settingsCustomBangsSnippet')
  snippetInput.autocomplete = 'off'
  snippetInput.spellcheck = false

  redirectInput.value = redirect
  redirectInput.placeholder = l('settingsCustomBangsRedirect')
  redirectInput.autocomplete = 'off'
  redirectInput.spellcheck = false

  deleteButton.setAttribute('type', 'button')
  deleteButton.innerHTML = '<i class="i carbon:trash-can"></i>'

  function update (key, input) {
    settings.get('customBangs', function (d) {
      var filtered = d ? d.filter(function (b) {
        return b.phrase !== current.phrase && (key !== 'phrase' || b.phrase !== input.value)
      }) : []
      filtered.push({ phrase: bangInput.value, snippet: snippetInput.value, redirect: redirectInput.value })
      settings.set('customBangs', filtered)
      current[key] = input.value
    })
  }

  bangInput.addEventListener('input', function () { update('phrase', bangInput) })
  snippetInput.addEventListener('input', function () { update('snippet', snippetInput) })
  redirectInput.addEventListener('input', function () { update('redirect', redirectInput) })

  deleteButton.addEventListener('click', function () {
    li.remove()
    settings.get('customBangs', function (d) {
      if (d) {
        settings.set('customBangs', d.filter(function (b) { return b.phrase !== bangInput.value }))
      }
    })
    showRestartRequiredBanner()
  })

  li.appendChild(bangInput)
  li.appendChild(snippetInput)
  li.appendChild(redirectInput)
  li.appendChild(deleteButton)
  bangslist.appendChild(li)
}
