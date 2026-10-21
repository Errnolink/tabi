var urlCleaningCheckbox = document.getElementById('checkbox-url-cleaning')
var scriptCheckbox = document.getElementById('checkbox-block-script')
var imageCheckbox = document.getElementById('checkbox-block-image')

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
    if (e.data && e.data.message === 'extensionsReply' && e.data.data && e.data.data.replyTo === extensionFilterRequestId) {
      window.removeEventListener('message', extensionFilterListener)
      var extensions = e.data.data.extensions || []
      var hasBlockingExtension = extensions.some(function (ext) {
        return ext.blocksMinFilter
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
var dohCustomError = document.getElementById('doh-custom-error')
var dohSavedTemplate = ''
var dohInputDebounce = null

function dohCustomTemplateIsValid (value) {
  try {
    var parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
  } catch (e) {
    return false
  }
}

function showDohCustomError (show) {
  if (dohCustomError) {
    dohCustomError.hidden = !show
  }
}

function updateDnsUI (doh) {
  doh = doh || { mode: 'automatic', provider: 'cloudflare' }
  var mode = doh.mode || 'automatic'
  var provider = doh.provider || 'cloudflare'
  var customTemplate = doh.customTemplate || ''

  if (dohModeSelect) dohModeSelect.value = mode
  if (dohProviderSelect) dohProviderSelect.value = provider
  if (dohCustomTemplateInput) dohCustomTemplateInput.value = customTemplate
  dohSavedTemplate = customTemplate

  showDohCustomError(false)
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
  dohSavedTemplate = customTemplate
  showDohCustomError(false)
  if (dohProviderRow) dohProviderRow.hidden = (mode === 'off')
  if (dohCustomRow) dohCustomRow.hidden = (mode === 'off' || provider !== 'custom')
}

function commitDohCustomTemplate () {
  if (!dohCustomTemplateInput) {
    return
  }
  var value = dohCustomTemplateInput.value.trim()
  if (value === dohSavedTemplate) {
    showDohCustomError(false)
    return
  }
  if (value === '' || dohCustomTemplateIsValid(value)) {
    saveDnsSettings()
  } else {
    showDohCustomError(true)
  }
}

if (dohModeSelect) {
  settings.get('dnsOverHttps', function (value) {
    updateDnsUI(value)
  })

  dohModeSelect.addEventListener('change', saveDnsSettings)
  if (dohProviderSelect) dohProviderSelect.addEventListener('change', saveDnsSettings)
  if (dohCustomTemplateInput) {
    dohCustomTemplateInput.addEventListener('input', function () {
      clearTimeout(dohInputDebounce)
      var value = this.value.trim()
      dohInputDebounce = setTimeout(function () {
        showDohCustomError(value !== '' && value !== dohSavedTemplate && !dohCustomTemplateIsValid(value))
      }, 400)
    })
    dohCustomTemplateInput.addEventListener('change', commitDohCustomTemplate)
    dohCustomTemplateInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitDohCustomTemplate()
        this.blur()
      }
    })
  }
}
