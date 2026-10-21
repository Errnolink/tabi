import { pdfjsLib, rawUrl, docUrl, eventBus, linkService, findController, container, pdfViewer, thumbnailViewer, progressBar, setProgress } from './context.js'
import { readSavedPage, savePage } from './persistence.js'
import { isFindBarOpen, openFindBar, closeFindBar } from './find.js'
import { sidebarOpen, toggleSidebar, renderOutline } from './sidebar.js'
import { zoomDropdown, zoomMenuBtn } from './toolbarZoom.js'

const loadingTask = pdfjsLib.getDocument({
  url: docUrl,
  withCredentials: true,
  isEvalSupported: false
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
  showLoadError(err)
})

eventBus.on('pagesinit', function () {
  pdfViewer.currentScaleValue = 'page-width'

  const saved = readSavedPage(rawUrl)
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
  savePage(rawUrl, evt.pageNumber)
})

const errorOverlay = document.getElementById('pdf-error')
const errorDetail = document.getElementById('pdf-error-detail')

function showLoadError (err) {
  if (progressBar) {
    progressBar.style.opacity = '0'
  }
  if (errorDetail) {
    errorDetail.textContent = (err && err.message) ? err.message : ''
  }
  if (errorOverlay) {
    errorOverlay.hidden = false
  }
}

function downloadPDF () {
  if (rawUrl.startsWith('file://')) {
    window.postMessage({ message: 'saveLocalPDF', url: rawUrl }, '*')
    return
  }
  window.postMessage({ message: 'downloadFile', url: rawUrl }, '*')
}

const errorRetryButton = document.getElementById('pdf-error-retry')
if (errorRetryButton) {
  errorRetryButton.addEventListener('click', function () {
    window.location.reload()
  })
}

const errorSaveButton = document.getElementById('pdf-error-save')
if (errorSaveButton) {
  errorSaveButton.addEventListener('click', downloadPDF)
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

window.parentProcessActions = {
  startFindInPage: openFindBar,
  endFindInPage: closeFindBar,
  printPDF: printPDF,
  downloadPDF: downloadPDF
}
