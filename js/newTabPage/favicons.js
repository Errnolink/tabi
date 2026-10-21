const faviconMemoryCache = new Map()
const faviconFailures = new Set()

function resolveFavicon (url) {
  let host
  try {
    host = new URL(url).hostname
  } catch (e) {
    return Promise.resolve(null)
  }
  if (!host || faviconFailures.has(host)) {
    return Promise.resolve(null)
  }
  if (faviconMemoryCache.has(host)) {
    return faviconMemoryCache.get(host)
  }
  const pending = ipc.invoke('fetchFavicon', host).then(function (result) {
    if (result && result.dataUrl) {
      return result.dataUrl
    }
    faviconFailures.add(host)
    return null
  }).catch(function () {
    faviconFailures.add(host)
    return null
  })
  faviconMemoryCache.set(host, pending)
  return pending
}

function cleanTitleFromUrl (url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const parts = host.split('.')
    if (parts.length > 0) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    }
    return host
  } catch (e) {
    return url
  }
}

module.exports = {
  resolveFavicon,
  cleanTitleFromUrl
}
