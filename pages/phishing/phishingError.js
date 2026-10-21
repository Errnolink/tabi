var ignoreButton = document.getElementById('ignore-button')
var continueButton = document.getElementById('continue-button')

var listLabels = {
  urlhaus: 'URLhaus',
  phishing: 'phishing-filter'
}

function urlIsWebURL (value) {
  if (typeof value !== 'string') {
    return false
  }
  try {
    var parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch (e) {
    return false
  }
}

var targetURL = null
try {
  var rawURLParam = decodeURIComponent(new URLSearchParams(window.location.search.replace('?', '')).get('url'))
  if (urlIsWebURL(rawURLParam)) {
    targetURL = rawURLParam
  }
} catch (e) { }

try {
  var listId = new URLSearchParams(window.location.search).get('list')
  if (listLabels[listId]) {
    var sourceEl = document.getElementById('phishing-source')
    sourceEl.textContent = l('phishingErrorSource').replace('%s', listLabels[listId])
    sourceEl.hidden = false
  }
} catch (e) { }

if (!targetURL) {
  ignoreButton.hidden = true
}

ignoreButton.addEventListener('click', function () {
  if (!targetURL) {
    return
  }
  // add the domain to the exception list

  settings.get('phishingWhitelist', function (value) {
    if (!value) {
      value = []
    }

    var domain
    try {
      domain = new URL(targetURL).hostname
    } catch (e) {
      return
    }

    value.push(domain)

    settings.set('phishingWhitelist', value)

    // redirect back to the original page

    window.location = targetURL
  })
})

continueButton.addEventListener('click', function () {
  window.location = 'https://duckduckgo.com'
})
