import { eventBus, pdfViewer, container } from './context.js'
import { isFindBarOpen, closeFindBar } from './find.js'

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

window.addEventListener('resize', function () {
  if (['page-width', 'page-fit', 'auto'].includes(pdfViewer.currentScaleValue)) {
    pdfViewer.currentScaleValue = pdfViewer.currentScaleValue
  }
})

export { showToolbar, zoomDropdown, zoomMenuBtn }
