import { pdfjsViewer, eventBus, container } from './context.js'
import { showToolbar } from './toolbarZoom.js'

const findBar = document.getElementById('find-bar')
const findInput = document.getElementById('find-input')
const findCount = document.getElementById('find-count')
const findBtn = document.getElementById('find-btn')
let isFindBarOpen = false

function executeFind (type, options) {
  options = options || {}
  eventBus.dispatch('find', {
    type: type || '',
    query: options.query !== undefined ? options.query : (findInput ? findInput.value : ''),
    phraseSearch: options.phraseSearch !== undefined ? options.phraseSearch : true,
    caseSensitive: false,
    entireWord: false,
    highlightAll: options.highlightAll !== undefined ? options.highlightAll : true,
    findPrevious: options.findPrevious !== undefined ? options.findPrevious : false
  })
}

function openFindBar () {
  if (!findBar) return
  findBar.hidden = false
  isFindBarOpen = true
  if (findBtn) findBtn.classList.add('active')
  showToolbar()
  const zoomDropdown = document.getElementById('zoom-dropdown')
  const settingsDropdown = document.getElementById('settings-dropdown')
  if (zoomDropdown) zoomDropdown.hidden = true
  if (settingsDropdown) settingsDropdown.hidden = true
  if (findInput) {
    findInput.focus()
    findInput.select()
    if (findInput.value) {
      executeFind('', {
        query: findInput.value,
        phraseSearch: true,
        highlightAll: true,
        findPrevious: false
      })
    }
  }
}

function closeFindBar () {
  if (!findBar) return
  findBar.hidden = true
  isFindBarOpen = false
  if (findBtn) findBtn.classList.remove('active')
  eventBus.dispatch('findbarclose')
  executeFind('', {
    query: '',
    phraseSearch: true,
    highlightAll: false,
    findPrevious: false
  })
  if (findCount) {
    findCount.textContent = ''
  }
  container.focus()
}

if (findBtn) {
  findBtn.addEventListener('click', function () {
    if (isFindBarOpen) {
      closeFindBar()
    } else {
      openFindBar()
    }
  })
}

if (findInput) {
  findInput.addEventListener('input', function () {
    const query = this.value
    if (!query) {
      if (findCount) findCount.textContent = ''
      eventBus.dispatch('findbarclose')
      executeFind('', { query: '', highlightAll: false })
      return
    }
    executeFind('', {
      query: query,
      phraseSearch: true,
      highlightAll: true,
      findPrevious: false
    })
  })

  findInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      executeFind('again', { findPrevious: e.shiftKey })
    } else if (e.key === 'Escape') {
      closeFindBar()
    }
  })
}

const findPrevBtn = document.getElementById('find-prev')
if (findPrevBtn) {
  findPrevBtn.addEventListener('click', function () {
    executeFind('again', { findPrevious: true })
  })
}

const findNextBtn = document.getElementById('find-next')
if (findNextBtn) {
  findNextBtn.addEventListener('click', function () {
    executeFind('again', { findPrevious: false })
  })
}

const findCloseBtn = document.getElementById('find-close')
if (findCloseBtn) {
  findCloseBtn.addEventListener('click', closeFindBar)
}

eventBus.on('updatefindmatchescount', function (data) {
  if (!findInput || !findInput.value || !findCount) {
    if (findCount) findCount.textContent = ''
    return
  }
  if (data.matchesCount.total > 0) {
    findCount.textContent = data.matchesCount.current + ' of ' + data.matchesCount.total
  } else {
    findCount.textContent = '0 of 0'
  }
})

eventBus.on('updatefindcontrolstate', function (data) {
  if (!findInput || !findInput.value || !findCount) return
  if (data.state === pdfjsViewer.FindState.NOT_FOUND) {
    findCount.textContent = '0 of 0'
  }
})

export { isFindBarOpen, openFindBar, closeFindBar }
