var ignoreButton = document.getElementById('ignore-button')
var continueButton = document.getElementById('continue-button')

var listLabels = {
  urlhaus: 'URLhaus',
  phishing: 'phishing-filter'
}

try {
  var listId = new URLSearchParams(window.location.search).get('list')
  if (listLabels[listId]) {
    var sourceEl = document.getElementById('phishing-source')
    sourceEl.textContent = l('phishingErrorSource').replace('%s', listLabels[listId])
    sourceEl.hidden = false
  }
} catch (e) { }

ignoreButton.addEventListener('click', function () {
  // add the domain to the exception list

  settings.get('phishingWhitelist', function (value) {
    if (!value) {
      value = []
    }

    var searchParams = new URLSearchParams(window.location.search.replace('?', ''))

    var url = decodeURIComponent(searchParams.get('url'))

    if (!url) {
      throw new Error('URL cannot be undefined')
    }

    var domain = new URL(url).hostname

    value.push(domain)

    settings.set('phishingWhitelist', value)

    // redirect back to the original page

    window.location = url
  })
})

continueButton.addEventListener('click', function () {
  window.location = 'https://duckduckgo.com'
})
