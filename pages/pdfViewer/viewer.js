import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs'
import * as pdfjsViewer from '../../node_modules/pdfjs-dist/web/pdf_viewer.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'

const rawUrl = new URLSearchParams(window.location.search.replace('?', '')).get('url')
if (!rawUrl) {
  throw new Error('Missing URL parameter for PDF viewer')
}

const docUrl = rawUrl.startsWith('file://') ? ('min://app/pdf-file?url=' + encodeURIComponent(rawUrl)) : rawUrl

const eventBus = new pdfjsViewer.EventBus()

const linkService = new pdfjsViewer.PDFLinkService({
  eventBus,
  externalLinkTarget: pdfjsViewer.LinkTarget.BLANK
})

const findController = new pdfjsViewer.PDFFindController({
  eventBus,
  linkService,
  updateMatchesCountOnProgress: true
})

const container = document.getElementById('viewer-container')
const viewer = document.getElementById('viewer')

const pdfViewer = new pdfjsViewer.PDFViewer({
  container,
  viewer,
  eventBus,
  linkService,
  findController,
  textLayerMode: 1,
  annotationMode: 2,
  removePageBorders: false
})

linkService.setViewer(pdfViewer)

const thumbnailContainer = document.getElementById('thumbnail-view')
let thumbnailViewer = null

if (thumbnailContainer && pdfjsViewer.PDFThumbnailViewer) {
  thumbnailViewer = new pdfjsViewer.PDFThumbnailViewer({
    container: thumbnailContainer,
    eventBus,
    linkService,
    renderingQueue: pdfViewer.renderingQueue
  })
  if (pdfViewer.renderingQueue) {
    pdfViewer.renderingQueue.setThumbnailViewer(thumbnailViewer)
  }
}

const progressBar = document.getElementById('progress-bar')

function setProgress (ratio) {
  if (!progressBar) return
  if (ratio >= 1) {
    progressBar.style.transform = 'scaleX(1)'
    setTimeout(() => {
      progressBar.style.opacity = '0'
    }, 200)
  } else {
    progressBar.style.opacity = '1'
    progressBar.style.transform = 'scaleX(' + Math.max(0.05, ratio) + ')'
  }
}

const loadingTask = pdfjsLib.getDocument({
  url: docUrl,
  withCredentials: true
})

loadingTask.onProgress = function (progress) {
  if (progress.total > 0) {
    setProgress(progress.loaded / progress.total)
  }
}

let pdfDocument = null

loadingTask.promise.then(async function (_pdfDocument) {
  pdfDocument = _pdfDocument
  setProgress(1)

  pdfViewer.setDocument(pdfDocument)
  linkService.setDocument(pdfDocument)
  findController.setDocument(pdfDocument)
  if (thumbnailViewer) {
    thumbnailViewer.setDocument(pdfDocument)
  }

  const pageTotalEl = document.getElementById('page-total')
  if (pageTotalEl) {
    pageTotalEl.textContent = pdfDocument.numPages
  }

  const pageInput = document.getElementById('page-input')
  if (pageInput) {
    pageInput.max = pdfDocument.numPages
  }

  try {
    const meta = await pdfDocument.getMetadata()
    if (meta?.info?.Title) {
      document.title = meta.info.Title
    } else {
      const parts = rawUrl.split(/[/\\]/)
      document.title = decodeURIComponent(parts[parts.length - 1].split('?')[0]) || 'PDF'
    }
  } catch (e) {
    const parts = rawUrl.split(/[/\\]/)
    document.title = decodeURIComponent(parts[parts.length - 1].split('?')[0]) || 'PDF'
  }

  try {
    const outline = await pdfDocument.getOutline()
    renderOutline(outline, document.getElementById('outline-view'))
  } catch (e) {
    renderOutline(null, document.getElementById('outline-view'))
  }
}).catch(function (err) {
  console.error('Failed to load PDF', err)
  downloadPDF()
})

eventBus.on('pagesinit', function () {
  pdfViewer.currentScaleValue = 'page-width'

  const saved = parseInt(localStorage.getItem('xb_pdf_last_page_' + rawUrl), 10)
  if (saved && saved >= 1 && saved <= pdfViewer.pagesCount) {
    pdfViewer.currentPageNumber = saved
  }
})

eventBus.on('pagechanging', function (evt) {
  const pageInput = document.getElementById('page-input')
  if (pageInput) {
    pageInput.value = evt.pageNumber
  }
  if (thumbnailViewer && sidebarOpen) {
    thumbnailViewer.scrollThumbnailIntoView(evt.pageNumber)
  }
  try {
    localStorage.setItem('xb_pdf_last_page_' + rawUrl, String(evt.pageNumber))
  } catch (e) {}
})

eventBus.on('scalechanging', function (evt) {
  const label = document.getElementById('zoom-label')
  if (label) {
    if (evt.presetValue === 'page-width') {
      label.textContent = l('PDFZoomFitWidth') || 'Fit width'
    } else if (evt.presetValue === 'page-fit') {
      label.textContent = l('PDFZoomFitPage') || 'Fit page'
    } else if (evt.presetValue === 'auto') {
      label.textContent = l('PDFZoomAuto') || 'Automatic'
    } else {
      label.textContent = Math.round(evt.scale * 100) + '%'
    }
  }

  document.querySelectorAll('#zoom-dropdown .dropdown-item').forEach(function (item) {
    const val = item.getAttribute('data-zoom')
    if (val === evt.presetValue || Math.abs(parseFloat(val) - evt.scale) < 0.01) {
      item.classList.add('selected')
    } else {
      item.classList.remove('selected')
    }
  })
})

const pageInput = document.getElementById('page-input')
if (pageInput) {
  pageInput.addEventListener('change', function () {
    const p = parseInt(this.value, 10)
    if (p >= 1 && p <= pdfViewer.pagesCount) {
      pdfViewer.currentPageNumber = p
    } else {
      this.value = pdfViewer.currentPageNumber
    }
  })
  pageInput.addEventListener('click', function () {
    this.select()
  })
}

const prevBtn = document.getElementById('page-prev')
if (prevBtn) {
  prevBtn.addEventListener('click', function () {
    if (pdfViewer.currentPageNumber > 1) {
      pdfViewer.currentPageNumber--
    }
  })
}

const nextBtn = document.getElementById('page-next')
if (nextBtn) {
  nextBtn.addEventListener('click', function () {
    if (pdfViewer.currentPageNumber < pdfViewer.pagesCount) {
      pdfViewer.currentPageNumber++
    }
  })
}

const zoomMenuBtn = document.getElementById('zoom-menu-btn')
const zoomDropdown = document.getElementById('zoom-dropdown')

function toggleZoomDropdown () {
  if (!zoomDropdown) return
  zoomDropdown.hidden = !zoomDropdown.hidden
  const settingsDropdown = document.getElementById('settings-dropdown')
  if (settingsDropdown && !zoomDropdown.hidden) {
    settingsDropdown.hidden = true
  }
  if (!zoomDropdown.hidden && isFindBarOpen) {
    closeFindBar()
  }
}

if (zoomMenuBtn) {
  zoomMenuBtn.addEventListener('click', function (e) {
    e.stopPropagation()
    toggleZoomDropdown()
  })
}

document.querySelectorAll('#zoom-dropdown .dropdown-item').forEach(function (item) {
  item.addEventListener('click', function () {
    const zoomVal = this.getAttribute('data-zoom')
    if (['page-width', 'page-fit', 'auto'].includes(zoomVal)) {
      pdfViewer.currentScaleValue = zoomVal
    } else {
      pdfViewer.currentScale = parseFloat(zoomVal)
    }
    if (zoomDropdown) {
      zoomDropdown.hidden = true
    }
  })
})

const zoomInBtn = document.getElementById('zoom-in')
if (zoomInBtn) {
  zoomInBtn.addEventListener('click', function () {
    pdfViewer.currentScale = Math.min(5.0, (pdfViewer.currentScale || 1.0) * 1.25)
  })
}

const zoomOutBtn = document.getElementById('zoom-out')
if (zoomOutBtn) {
  zoomOutBtn.addEventListener('click', function () {
    pdfViewer.currentScale = Math.max(0.25, (pdfViewer.currentScale || 1.0) * 0.8)
  })
}

const rotateBtn = document.getElementById('rotate-btn')
if (rotateBtn) {
  rotateBtn.addEventListener('click', function () {
    pdfViewer.pagesRotation = ((pdfViewer.pagesRotation || 0) + 90) % 360
  })
}

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

const sidebar = document.getElementById('sidebar')
const tabOutline = document.getElementById('tab-outline')
const tabThumbnails = document.getElementById('tab-thumbnails')
const outlineView = document.getElementById('outline-view')
const thumbnailView = document.getElementById('thumbnail-view')
const sidebarToggle = document.getElementById('sidebar-toggle')
const sidebarClose = document.getElementById('sidebar-close')
let sidebarOpen = false

function toggleSidebar () {
  if (!sidebar) return
  sidebarOpen = !sidebarOpen
  if (sidebarOpen) {
    sidebar.classList.add('open')
    document.body.classList.add('sidebar-open')
    if (sidebarToggle) sidebarToggle.classList.add('active')
    if (thumbnailViewer && !thumbnailView.classList.contains('hidden')) {
      thumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber)
    }
  } else {
    sidebar.classList.remove('open')
    document.body.classList.remove('sidebar-open')
    if (sidebarToggle) sidebarToggle.classList.remove('active')
  }
  setTimeout(function () {
    if (['page-width', 'page-fit', 'auto'].includes(pdfViewer.currentScaleValue)) {
      pdfViewer.currentScaleValue = pdfViewer.currentScaleValue
    }
  }, 250)
}

if (sidebarToggle) {
  sidebarToggle.addEventListener('click', toggleSidebar)
}

if (sidebarClose) {
  sidebarClose.addEventListener('click', function () {
    if (sidebarOpen) toggleSidebar()
  })
}

if (tabOutline) {
  tabOutline.addEventListener('click', function () {
    tabOutline.classList.add('active')
    tabThumbnails.classList.remove('active')
    outlineView.classList.remove('hidden')
    thumbnailView.classList.add('hidden')
  })
}

if (tabThumbnails) {
  tabThumbnails.addEventListener('click', function () {
    tabThumbnails.classList.add('active')
    tabOutline.classList.remove('active')
    thumbnailView.classList.remove('hidden')
    outlineView.classList.add('hidden')
    if (thumbnailViewer) {
      thumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber)
    }
  })
}

function renderOutline (outline, containerEl) {
  if (!containerEl) return
  containerEl.innerHTML = ''
  if (!outline || outline.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'sidebar-empty'
    empty.textContent = l('PDFNoOutline') || 'No outline available'
    containerEl.appendChild(empty)
    if (tabThumbnails) {
      tabThumbnails.click()
    }
    return
  }

  function createList (items) {
    const ul = document.createElement('ul')
    ul.className = 'outline-list'
    items.forEach(function (item) {
      const li = document.createElement('li')
      li.className = 'outline-item'

      const row = document.createElement('div')
      row.className = 'outline-row'

      const hasChildren = item.items && item.items.length > 0
      if (hasChildren) {
        const toggle = document.createElement('button')
        toggle.className = 'outline-toggle i carbon:chevron-down'
        toggle.addEventListener('click', function (e) {
          e.stopPropagation()
          li.classList.toggle('collapsed')
          toggle.classList.toggle('carbon:chevron-right')
          toggle.classList.toggle('carbon:chevron-down')
        })
        row.appendChild(toggle)
      } else {
        const spacer = document.createElement('span')
        spacer.className = 'outline-spacer'
        row.appendChild(spacer)
      }

      const link = document.createElement('a')
      link.className = 'outline-link'
      link.textContent = item.title
      link.href = '#'
      link.addEventListener('click', function (e) {
        e.preventDefault()
        if (item.dest) {
          linkService.goToDestination(item.dest)
        } else if (item.url) {
          window.open(item.url, '_blank')
        }
      })
      row.appendChild(link)
      li.appendChild(row)

      if (hasChildren) {
        li.appendChild(createList(item.items))
      }
      ul.appendChild(li)
    })
    return ul
  }

  containerEl.appendChild(createList(outline))
}

function downloadPDF () {
  window.postMessage({ message: 'downloadFile', url: rawUrl }, '*')
}

function printPDF () {
  window.print()
}

const downloadBtn = document.getElementById('download-button')
if (downloadBtn) {
  downloadBtn.addEventListener('click', downloadPDF)
}

const printBtn = document.getElementById('print-button')
if (printBtn) {
  printBtn.addEventListener('click', printPDF)
}

const openExternalBtn = document.getElementById('open-external-button')
if (openExternalBtn) {
  openExternalBtn.addEventListener('click', function () {
    window.open(rawUrl, '_blank')
  })
}

const toolbar = document.getElementById('floating-toolbar')
let isToolbarHovered = false
let lastScrollTop = 0

function showToolbar () {
  if (toolbar) toolbar.classList.remove('hidden-toolbar')
}

function hideToolbar () {
  if (!toolbar) return
  const zoomDropdown = document.getElementById('zoom-dropdown')
  const settingsDropdown = document.getElementById('settings-dropdown')
  const isDropdownOpen = (zoomDropdown && !zoomDropdown.hidden) || (settingsDropdown && !settingsDropdown.hidden)
  if (isToolbarHovered || isDropdownOpen || isFindBarOpen) {
    return
  }
  toolbar.classList.add('hidden-toolbar')
}

if (toolbar) {
  toolbar.addEventListener('mouseenter', function () {
    isToolbarHovered = true
    showToolbar()
  })
  toolbar.addEventListener('mouseleave', function () {
    isToolbarHovered = false
  })
}

container.addEventListener('scroll', function () {
  const st = container.scrollTop
  const delta = st - lastScrollTop
  if (st <= 30) {
    showToolbar()
  } else if (delta > 15) {
    hideToolbar()
  } else if (delta < -15) {
    showToolbar()
  }
  lastScrollTop = st
}, { passive: true })

window.addEventListener('mousemove', function (e) {
  if (e.clientY <= 55) {
    showToolbar()
  }
})

document.addEventListener('click', function (e) {
  if (zoomDropdown && !zoomDropdown.hidden && !zoomDropdown.contains(e.target) && e.target !== zoomMenuBtn && !zoomMenuBtn.contains(e.target)) {
    zoomDropdown.hidden = true
  }
})

window.addEventListener('keydown', function (e) {
  const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault()
    openFindBar()
    return
  }

  if (e.key === 'Escape') {
    if (isFindBarOpen) {
      closeFindBar()
      return
    }
    if (zoomDropdown && !zoomDropdown.hidden) {
      zoomDropdown.hidden = true
      return
    }
    const settingsDropdown = document.getElementById('settings-dropdown')
    if (settingsDropdown && !settingsDropdown.hidden) {
      settingsDropdown.hidden = true
      return
    }
    if (sidebarOpen) {
      toggleSidebar()
      return
    }
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    pdfViewer.currentScale = Math.min(5.0, (pdfViewer.currentScale || 1.0) * 1.25)
    return
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
    e.preventDefault()
    pdfViewer.currentScale = Math.max(0.25, (pdfViewer.currentScale || 1.0) * 0.8)
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault()
    pdfViewer.currentScaleValue = 'page-width'
    return
  }

  if (!isInput) {
    if (e.key === 'ArrowDown') {
      container.scrollTop += 60
    } else if (e.key === 'ArrowUp') {
      container.scrollTop -= 60
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      container.scrollTop += container.clientHeight * 0.85
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      container.scrollTop -= container.clientHeight * 0.85
    } else if (e.key === 'Home') {
      e.preventDefault()
      pdfViewer.currentPageNumber = 1
      container.scrollTop = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      pdfViewer.currentPageNumber = pdfViewer.pagesCount
    }
  }
})

window.addEventListener('resize', function () {
  if (['page-width', 'page-fit', 'auto'].includes(pdfViewer.currentScaleValue)) {
    pdfViewer.currentScaleValue = pdfViewer.currentScaleValue
  }
})

window.parentProcessActions = {
  startFindInPage: openFindBar,
  endFindInPage: closeFindBar,
  printPDF: printPDF,
  downloadPDF: downloadPDF
}
