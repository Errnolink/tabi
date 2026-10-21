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

export {
  pdfjsLib,
  pdfjsViewer,
  rawUrl,
  docUrl,
  eventBus,
  linkService,
  findController,
  container,
  viewer,
  pdfViewer,
  thumbnailViewer,
  progressBar,
  setProgress
}
