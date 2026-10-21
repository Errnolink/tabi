var clearDataPanel = document.getElementById('clear-data-panel')
var showClearDataBtn = document.getElementById('btn-show-clear-data')
var clearDataCancelBtn = document.getElementById('btn-clear-data-cancel')
var clearDataConfirmBtn = document.getElementById('btn-clear-data-confirm')
var clearDataRangeSelect = document.getElementById('clear-data-range')
var clearDataContainersSelect = document.getElementById('clear-data-containers')
var clearDataStatus = document.getElementById('clear-data-status')
var clearDataChecks = {
  history: document.getElementById('clear-check-history'),
  siteData: document.getElementById('clear-check-sitedata'),
  cache: document.getElementById('clear-check-cache'),
  thumbnails: document.getElementById('clear-check-thumbnails'),
  downloads: document.getElementById('clear-check-downloads')
}
var clearDataSentId = null
var containersListRequestId = null

function loadContainerOptions () {
  containersListRequestId = Math.random()
  window.postMessage({ message: 'containersPage:list', id: containersListRequestId }, window.location.toString())
}

window.addEventListener('message', function (e) {
  if (!e.data || e.data.message !== 'containersPage:result' || e.data.id !== containersListRequestId) {
    return
  }
  containersListRequestId = null
  var state = e.data.result
  var select = clearDataContainersSelect
  if (!state || !Array.isArray(state.containers) || !select) {
    return
  }
  var current = select.value
  while (select.options.length > 1) {
    select.remove(1)
  }
  state.containers.forEach(function (container) {
    var option = document.createElement('option')
    option.value = container.id
    option.textContent = container.name || container.id
    select.appendChild(option)
  })
  if (current) {
    select.value = current
  }
})

function openClearDataPanel () {
  if (!clearDataPanel) {
    return
  }
  clearDataPanel.hidden = false
  loadContainerOptions()
  var section = document.getElementById('privacy-settings-container')
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  var privacyNav = document.querySelector('#settings-nav a[href="#privacy-settings-container"]')
  if (privacyNav) {
    navItems.forEach(function (item) {
      item.classList.toggle('active', item === privacyNav)
    })
  }
}

if (showClearDataBtn) {
  showClearDataBtn.addEventListener('click', openClearDataPanel)
}

if (clearDataCancelBtn) {
  clearDataCancelBtn.addEventListener('click', function () {
    clearDataPanel.hidden = true
  })
}

if (clearDataChecks.siteData && clearDataContainersSelect) {
  clearDataChecks.siteData.addEventListener('change', function () {
    clearDataContainersSelect.disabled = !this.checked
  })
}

if (clearDataConfirmBtn) {
  clearDataConfirmBtn.addEventListener('click', function () {
    var containerValue = clearDataContainersSelect ? clearDataContainersSelect.value : 'all'
    var request = {
      id: Date.now() + '-' + Math.floor(Math.random() * 1e6),
      history: clearDataChecks.history.checked,
      range: clearDataRangeSelect ? clearDataRangeSelect.value : 'all',
      siteData: clearDataChecks.siteData.checked,
      allContainers: containerValue === 'all',
      containerIds: containerValue === 'all' ? [] : [containerValue],
      cache: clearDataChecks.cache.checked,
      thumbnails: clearDataChecks.thumbnails.checked,
      downloads: clearDataChecks.downloads.checked
    }
    if (!request.history && !request.siteData && !request.cache && !request.thumbnails && !request.downloads) {
      return
    }
    clearDataSentId = request.id
    if (clearDataStatus) {
      clearDataStatus.textContent = l('settingsClearDataWorking')
    }
    settings.set('clearDataRequest', request)
  })
}

settings.listen('clearDataResult', function (result) {
  if (!result || result.id !== clearDataSentId) {
    return
  }
  clearDataSentId = null
  if (clearDataStatus) {
    clearDataStatus.textContent = result.ok ? l('settingsClearDataDone') : l('settingsClearDataFailed')
  }
})

if (new URLSearchParams(window.location.search).has('clearData')) {
  openClearDataPanel()
}
