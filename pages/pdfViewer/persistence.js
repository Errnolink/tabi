export function readSavedPage (rawUrl) {
  return parseInt(localStorage.getItem('tabi_pdf_last_page_' + rawUrl), 10)
}

export function savePage (rawUrl, pageNumber) {
  try {
    localStorage.setItem('tabi_pdf_last_page_' + rawUrl, String(pageNumber))
  } catch (e) {}
}
