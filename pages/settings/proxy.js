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
