import { pdfViewer, thumbnailViewer, linkService } from './context.js'

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

export { sidebarOpen, toggleSidebar, renderOutline }
