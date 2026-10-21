document.title = l('settingsPreferencesHeading') + ' | Tabi'

var banner = document.getElementById('restart-required-banner')
var siteThemeCheckbox = document.getElementById('checkbox-site-theme')
var userscriptsCheckbox = document.getElementById('checkbox-userscripts')
var showUserscriptsFolderBtn = document.getElementById('btn-show-userscripts-folder')
var separateTitlebarCheckbox = document.getElementById('checkbox-separate-titlebar')
var openTabsInForegroundCheckbox = document.getElementById('checkbox-open-tabs-in-foreground')
var autoPlayCheckbox = document.getElementById('checkbox-enable-autoplay')
var userAgentCheckbox = document.getElementById('checkbox-user-agent')
var userAgentInput = document.getElementById('input-user-agent')
var urlCleaningCheckbox = document.getElementById('checkbox-url-cleaning')
var scriptCheckbox = document.getElementById('checkbox-block-script')
var imageCheckbox = document.getElementById('checkbox-block-image')

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

var trackingLevelOptions = [
  document.getElementById('blocking-allow-all'),
  document.getElementById('blocking-third-party'),
  document.getElementById('blocking-block-all')
]
var blockingExceptionsContainer = document.getElementById('content-blocking-information')
var blockingExceptionsInput = document.getElementById('content-blocking-exceptions')

var extensionFilterNotice = document.getElementById('extension-filter-notice')
if (extensionFilterNotice) {
  var extensionFilterRequestId = 'settings-ext-filter-check'
  var extensionFilterListener = function (e) {
    if (e.data && e.data.message === 'extensionsResponse' && e.data.requestId === extensionFilterRequestId) {
      window.removeEventListener('message', extensionFilterListener)
      var hasBlockingExtension = (e.data.result || []).some(function (ext) {
        return (ext.package?.permissions || []).includes('webRequestBlocking')
      })
      extensionFilterNotice.hidden = !hasBlockingExtension
    }
  }
  window.addEventListener('message', extensionFilterListener)
  window.postMessage({ message: 'extensionsRequest', type: 'list', requestId: extensionFilterRequestId }, window.location.toString())
}

function updateBlockingLevelUI (level) {
  if (level === undefined || level === null) {
    level = 1
  }
  trackingLevelOptions.forEach(function (radio, idx) {
    if (radio) {
      radio.checked = (idx === level)
    }
  })
  if (blockingExceptionsContainer) {
    blockingExceptionsContainer.hidden = (level === 0)
  }
}

function changeBlockingLevelSetting (level) {
  settings.merge('filtering', { blockingLevel: level })
  updateBlockingLevelUI(level)
}

trackingLevelOptions.forEach(function (radio, idx) {
  if (radio) {
    radio.addEventListener('change', function () {
      if (this.checked) {
        changeBlockingLevelSetting(idx)
      }
    })
  }
})

function updateContentTypesUI (filtering) {
  var types = (filtering && filtering.contentTypes) || []
  if (scriptCheckbox) {
    scriptCheckbox.checked = types.includes('script')
  }
  if (imageCheckbox) {
    imageCheckbox.checked = types.includes('image')
  }
}

function toggleContentType (type, enabled) {
  settings.get('filtering', function (value) {
    var types = ((value && value.contentTypes) || []).slice()
    var idx = types.indexOf(type)
    if (enabled && idx === -1) {
      types.push(type)
    } else if (!enabled && idx !== -1) {
      types.splice(idx, 1)
    }
    settings.merge('filtering', { contentTypes: types })
  })
}

if (scriptCheckbox) {
  scriptCheckbox.addEventListener('change', function () {
    toggleContentType('script', this.checked)
  })
}

if (imageCheckbox) {
  imageCheckbox.addEventListener('change', function () {
    toggleContentType('image', this.checked)
  })
}

settings.get('filtering', function (value) {
  if (value && typeof value.trackers === 'boolean') {
    if (value.trackers === true) {
      value.blockingLevel = 1
    } else {
      value.blockingLevel = 0
    }
    delete value.trackers
    settings.set('filtering', value)
  }

  var level = 1
  if (value && value.blockingLevel !== undefined) {
    level = value.blockingLevel
  }
  updateBlockingLevelUI(level)

  if (value && value.exceptionDomains && blockingExceptionsInput) {
    blockingExceptionsInput.value = value.exceptionDomains.join(', ')
  }

  updateContentTypesUI(value)
})

var exceptionTimeout = null
if (blockingExceptionsInput) {
  blockingExceptionsInput.addEventListener('input', function () {
    clearTimeout(exceptionTimeout)
    var text = this.value
    exceptionTimeout = setTimeout(function () {
      var newValue = text.split(',').map(function (domain) {
        return domain.trim()
      }).filter(Boolean)
      settings.merge('filtering', { exceptionDomains: newValue })
    }, 400)
  })
}

settings.listen('filteringBlockedCount', function (value) {
  var count = value || 0
  var valueStr = count > 50000 ? '50,000+' : count.toLocaleString()
  var blockedEl = document.querySelector('#content-blocking-blocked-requests strong')
  if (blockedEl) {
    blockedEl.textContent = valueStr
  }
})

if (urlCleaningCheckbox) {
  settings.get('urlCleaning', function (value) {
    urlCleaningCheckbox.checked = (value !== false)
  })

  urlCleaningCheckbox.addEventListener('change', function () {
    settings.set('urlCleaning', this.checked)
  })
}

var dohModeSelect = document.getElementById('doh-mode')
var dohProviderSelect = document.getElementById('doh-provider')
var dohProviderRow = document.getElementById('doh-provider-row')
var dohCustomRow = document.getElementById('doh-custom-row')
var dohCustomTemplateInput = document.getElementById('doh-custom-template')

function updateDnsUI (doh) {
  doh = doh || { mode: 'automatic', provider: 'cloudflare' }
  var mode = doh.mode || 'automatic'
  var provider = doh.provider || 'cloudflare'
  var customTemplate = doh.customTemplate || ''

  if (dohModeSelect) dohModeSelect.value = mode
  if (dohProviderSelect) dohProviderSelect.value = provider
  if (dohCustomTemplateInput) dohCustomTemplateInput.value = customTemplate

  if (dohProviderRow) dohProviderRow.hidden = (mode === 'off')
  if (dohCustomRow) dohCustomRow.hidden = (mode === 'off' || provider !== 'custom')
}

function saveDnsSettings () {
  var mode = dohModeSelect ? dohModeSelect.value : 'automatic'
  var provider = dohProviderSelect ? dohProviderSelect.value : 'cloudflare'
  var customTemplate = dohCustomTemplateInput ? dohCustomTemplateInput.value.trim() : ''
  var doh = {
    mode: mode,
    provider: provider,
    customTemplate: customTemplate
  }
  settings.set('dnsOverHttps', doh)
  if (dohProviderRow) dohProviderRow.hidden = (mode === 'off')
  if (dohCustomRow) dohCustomRow.hidden = (mode === 'off' || provider !== 'custom')
}

if (dohModeSelect) {
  settings.get('dnsOverHttps', function (value) {
    updateDnsUI(value)
  })

  dohModeSelect.addEventListener('change', saveDnsSettings)
  if (dohProviderSelect) dohProviderSelect.addEventListener('change', saveDnsSettings)
  if (dohCustomTemplateInput) dohCustomTemplateInput.addEventListener('input', saveDnsSettings)
}

var darkModeNever = document.getElementById('dark-mode-never')
var darkModeNight = document.getElementById('dark-mode-night')
var darkModeAlways = document.getElementById('dark-mode-always')
var darkModeSystem = document.getElementById('dark-mode-system')

settings.get('darkMode', function (value) {
  if (darkModeNever) darkModeNever.checked = (value === -1)
  if (darkModeNight) darkModeNight.checked = (value === 0)
  if (darkModeAlways) darkModeAlways.checked = (value === 1 || value === true)
  if (darkModeSystem) darkModeSystem.checked = (value === 2 || value === undefined || value === false)
})

if (darkModeNever) {
  darkModeNever.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', -1)
  })
}
if (darkModeNight) {
  darkModeNight.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', 0)
  })
}
if (darkModeAlways) {
  darkModeAlways.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', 1)
  })
}
if (darkModeSystem) {
  darkModeSystem.addEventListener('change', function () {
    if (this.checked) settings.set('darkMode', 2)
  })
}

if (siteThemeCheckbox) {
  settings.get('siteTheme', function (value) {
    siteThemeCheckbox.checked = (value === true || value === undefined)
  })

  siteThemeCheckbox.addEventListener('change', function () {
    settings.set('siteTheme', this.checked)
  })
}

var startupSettingInput = document.getElementById('startup-options')
if (startupSettingInput) {
  settings.get('startupTabOption', function (value = 1) {
    startupSettingInput.value = value
  })

  startupSettingInput.addEventListener('change', function () {
    settings.set('startupTabOption', parseInt(this.value, 10))
  })
}

var tabSleepInput = document.getElementById('tab-sleep-options')
if (tabSleepInput) {
  settings.get('tabSleepMinutes', function (value = 60) {
    tabSleepInput.value = value
  })

  tabSleepInput.addEventListener('change', function () {
    settings.set('tabSleepMinutes', parseInt(this.value, 10))
  })
}

var newWindowSettingInput = document.getElementById('new-window-options')
if (newWindowSettingInput) {
  settings.get('newWindowOption', function (value = 1) {
    newWindowSettingInput.value = value
  })

  newWindowSettingInput.addEventListener('change', function () {
    settings.set('newWindowOption', parseInt(this.value, 10))
  })
}

if (userscriptsCheckbox) {
  settings.get('userscriptsEnabled', function (value) {
    userscriptsCheckbox.checked = !!value
  })

  userscriptsCheckbox.addEventListener('change', function () {
    settings.set('userscriptsEnabled', this.checked)
  })
}

if (showUserscriptsFolderBtn) {
  showUserscriptsFolderBtn.addEventListener('click', function () {
    postMessage({ message: 'showUserscriptDirectory' })
  })
}

var languagePicker = document.getElementById('setting-language-picker')
if (languagePicker && typeof languages !== 'undefined') {
  for (var language in languages) {
    var option = document.createElement('option')
    option.textContent = languages[language].name
    option.value = language
    languagePicker.appendChild(option)
  }

  settings.get('userSelectedLanguage', function (val) {
    if (val) {
      languagePicker.value = val
    } else {
      settings.get('language', function (fallback) {
        languagePicker.value = fallback || getCurrentLanguage()
      })
    }
  })

  languagePicker.addEventListener('change', function () {
    showRestartRequiredBanner()
    settings.set('userSelectedLanguage', this.value)
    settings.set('language', this.value)
  })
}

if (separateTitlebarCheckbox) {
  settings.get('useSeparateTitlebar', function (value) {
    separateTitlebarCheckbox.checked = (value === true)
  })

  separateTitlebarCheckbox.addEventListener('change', function () {
    settings.set('useSeparateTitlebar', this.checked)
    showRestartRequiredBanner()
  })
}

if (openTabsInForegroundCheckbox) {
  settings.get('openTabsInForeground', function (value) {
    openTabsInForegroundCheckbox.checked = (value === true)
  })

  openTabsInForegroundCheckbox.addEventListener('change', function () {
    settings.set('openTabsInForeground', this.checked)
  })
}

if (autoPlayCheckbox) {
  settings.get('enableAutoplay', function (value) {
    autoPlayCheckbox.checked = (value === true)
  })

  autoPlayCheckbox.addEventListener('change', function () {
    settings.set('enableAutoplay', this.checked)
  })
}

if (userAgentCheckbox && userAgentInput) {
  settings.get('customUserAgent', function (value) {
    if (value) {
      userAgentCheckbox.checked = true
      userAgentInput.style.display = 'block'
      userAgentInput.value = value
    } else {
      userAgentCheckbox.checked = false
      userAgentInput.style.display = 'none'
    }
  })

  userAgentCheckbox.addEventListener('change', function () {
    if (this.checked) {
      userAgentInput.style.display = 'block'
      userAgentInput.focus()
    } else {
      settings.set('customUserAgent', null)
      userAgentInput.style.display = 'none'
      userAgentInput.value = ''
      showRestartRequiredBanner()
    }
  })

  var userAgentTimeout = null
  userAgentInput.addEventListener('input', function () {
    clearTimeout(userAgentTimeout)
    var val = this.value
    userAgentTimeout = setTimeout(function () {
      if (val) {
        settings.set('customUserAgent', val)
      } else {
        settings.set('customUserAgent', null)
      }
      showRestartRequiredBanner()
    }, 500)
  })
}

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

var passwordManagersDropdown = document.getElementById('selected-password-manager')
if (passwordManagersDropdown && typeof passwordManagers !== 'undefined') {
  for (var mgr in passwordManagers) {
    var pOption = document.createElement('option')
    pOption.textContent = passwordManagers[mgr].name
    pOption.value = passwordManagers[mgr].name
    passwordManagersDropdown.appendChild(pOption)
  }

  settings.listen('passwordManager', function () {
    if (typeof currentPasswordManager !== 'undefined' && currentPasswordManager) {
      passwordManagersDropdown.value = currentPasswordManager.name
    }
  })

  passwordManagersDropdown.addEventListener('change', function () {
    if (this.value === 'none') {
      settings.set('passwordManager', { name: 'none' })
    } else {
      settings.set('passwordManager', { name: this.value })
    }
  })
}

var keychainViewLink = document.getElementById('keychain-view-link')
var viewPasswordsBtn = document.getElementById('btn-view-passwords')

function openCredentialList () {
  postMessage({ message: 'showCredentialList' })
}

if (keychainViewLink) {
  keychainViewLink.addEventListener('click', openCredentialList)
}
if (viewPasswordsBtn) {
  viewPasswordsBtn.addEventListener('click', openCredentialList)
}

settings.listen('passwordManager', function () {
  if (keychainViewLink) {
    keychainViewLink.hidden = !(typeof currentPasswordManager !== 'undefined' && currentPasswordManager && currentPasswordManager.name === 'Built-in password manager')
  }
})

var proxyTypeInput = document.getElementById('selected-proxy-type')
var proxyInputs = Array.from(document.querySelectorAll('#proxy-settings-container input'))

function toggleProxyOptions (proxyType) {
  var manualSec = document.getElementById('manual-proxy-section')
  var pacSec = document.getElementById('pac-option')
  if (manualSec) manualSec.hidden = (proxyType !== 1)
  if (pacSec) pacSec.hidden = (proxyType !== 2)
}

function setProxy (key, value) {
  settings.get('proxy', function (proxy = {}) {
    proxy[key] = value
    settings.set('proxy', proxy)
  })
}

if (proxyTypeInput) {
  settings.get('proxy', function (proxy = {}) {
    toggleProxyOptions(proxy.type)
    proxyTypeInput.options.selectedIndex = proxy.type || 0

    proxyInputs.forEach(function (item) {
      if (proxy[item.name]) {
        item.value = proxy[item.name]
      }
    })
  })

  proxyTypeInput.addEventListener('change', function (e) {
    setProxy('type', e.target.selectedIndex)
    toggleProxyOptions(e.target.selectedIndex)
  })

  proxyInputs.forEach(function (item) {
    item.addEventListener('change', function (e) {
      setProxy(e.target.name, e.target.value)
    })
  })
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
