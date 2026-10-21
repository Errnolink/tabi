/*
URL cleaning for navigations, controlled by the `urlCleaning` setting (on by
default). Three transforms, all URL-level:
* strip known tracking query parameters (utm_*, click IDs, ...) on top-level
  and subframe navigations,
* skip known tracking-redirect URLs (l.facebook.com, google.com/url, ...) by
  jumping straight to the destination carried in their query,
* rewrite AMP cache URLs (google.com/amp, cdn.ampproject.org) to the canonical
  page.
x.com, twitter.com and t.co URLs are never touched.
*/

/* global settings */

const urlCleaningParamsExact = new Set([
  'fbclid', // facebook
  'gclid', 'gclsrc', 'dclid', 'wbraid', 'gbraid', // google ads
  'msclkid', 's_kwcid', // microsoft
  'yclid', '_openstat', // yandex
  'twclid', // X
  'ttclid', // tiktok
  'mc_eid', 'mc_cid', // mailchimp
  'igshid', // instagram
  '_hsenc', '_hsmi', '__hstc', '__hssc', '__hsfp', 'hsCtaTracking', // hubspot
  'icid', // adobe
  'li_fat_id' // linkedin
])

const urlCleaningParamsPrefixes = [
  'utm_' // google analytics and everything else that copied it
]

const urlCleaningSiteParams = [
  { host: 'youtube.com', params: ['si'] },
  { host: 'youtu.be', params: ['si'] },
  { host: 'spotify.com', params: ['si'] },
  {
    host: 'amazon.com',
    params: ['_ref', 'ref_', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'pf_rd_i', 'pf_rd_m', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'pf_rd_t']
  },
  { host: 'ebay.com', params: ['_trkparms'] }
]

const urlCleaningRedirectSources = [
  { host: 'facebook.com', path: '/l.php', params: ['u'] },
  { host: 'out.reddit.com', path: null, params: ['url'] },
  { host: 'google.com', path: '/url', params: ['q', 'url', 'continue'] },
  { host: 'instagram.com', path: '/', params: ['u'] },
  { host: 'youtube.com', path: '/redirect', params: ['q'] },
  { host: 'steamcommunity.com', path: '/linkfilter', params: ['url'] },
  { host: 'linksynergy.com', path: null, params: ['murl'] }
]

const urlCleaningSkipHosts = [
  'x.com',
  'twitter.com',
  't.co'
]

function urlCleaningEnabled () {
  return settings.get('urlCleaning') !== false
}

function urlCleaningHostMatches (hostname, host) {
  return hostname === host || hostname.endsWith('.' + host)
}

function urlCleaningIsWebURL (urlString) {
  return typeof urlString === 'string' && (urlString.startsWith('http://') || urlString.startsWith('https://'))
}

function urlCleaningDecodeParam (value) {
  try {
    return decodeURIComponent(value)
  } catch (e) {
    return value
  }
}

function urlCleaningDestination (urlObj, entry) {
  for (var i = 0; i < entry.params.length; i++) {
    var raw = urlObj.searchParams.get(entry.params[i])
    if (!raw) {
      continue
    }
    var dest = urlCleaningDecodeParam(raw)
    if (!urlCleaningIsWebURL(dest)) {
      continue
    }
    try {
      var destURL = new URL(dest)
      if (destURL.href === urlObj.href) {
        continue
      }
      return destURL.href
    } catch (e) {
      continue
    }
  }
  return null
}

function urlCleaningDebounce (urlObj) {
  for (var i = 0; i < urlCleaningRedirectSources.length; i++) {
    var entry = urlCleaningRedirectSources[i]
    if (!urlCleaningHostMatches(urlObj.hostname, entry.host)) {
      continue
    }
    if (entry.path && urlObj.pathname !== entry.path && !urlObj.pathname.startsWith(entry.path)) {
      continue
    }
    var dest = urlCleaningDestination(urlObj, entry)
    if (dest) {
      return dest
    }
  }
  return null
}

function urlCleaningDeAMP (urlObj) {
  var isGoogle = urlCleaningHostMatches(urlObj.hostname, 'google.com')
  var isAMPProject = urlCleaningHostMatches(urlObj.hostname, 'ampproject.org')
  if (!isGoogle && !isAMPProject) {
    return null
  }

  var parts = urlObj.pathname.split('/').filter(function (part) { return part.length > 0 })
  if (isGoogle) {
    if (parts[0] !== 'amp') {
      return null
    }
    parts.shift()
  } else if (parts[0] === 'c' || parts[0] === 'wp') {
    parts.shift()
  }
  var secure = false
  if (parts[0] === 's') {
    secure = true
    parts.shift()
  } else if (parts[0] === 'http') {
    parts.shift()
  }
  if (parts.length === 0 || !parts[0].includes('.')) {
    return null
  }
  // google's cache params don't belong to the canonical page
  return (secure ? 'https' : 'http') + '://' + parts.join('/') + urlObj.hash
}

function urlCleaningStripParams (urlObj) {
  var siteEntries = urlCleaningSiteParams.filter(function (entry) {
    return urlCleaningHostMatches(urlObj.hostname, entry.host)
  })

  var toDelete = []
  urlObj.searchParams.forEach(function (value, name) {
    if (toDelete.includes(name)) {
      return
    }
    if (urlCleaningParamsExact.has(name) || urlCleaningParamsPrefixes.some(function (prefix) { return name.startsWith(prefix) })) {
      toDelete.push(name)
      return
    }
    if (siteEntries.some(function (entry) { return entry.params.includes(name) })) {
      toDelete.push(name)
    }
  })

  if (toDelete.length === 0) {
    return false
  }
  toDelete.forEach(function (name) {
    urlObj.searchParams.delete(name)
  })
  return true
}

function urlCleanNavigationURL (urlString, isMainFrame) {
  if (!urlCleaningIsWebURL(urlString)) {
    return null
  }
  var urlObj
  try {
    urlObj = new URL(urlString)
  } catch (e) {
    return null
  }
  if (urlCleaningSkipHosts.some(function (host) { return urlCleaningHostMatches(urlObj.hostname, host) })) {
    return null
  }

  if (isMainFrame) {
    var dest = urlCleaningDebounce(urlObj)
    if (dest) {
      return dest
    }
    var amp = urlCleaningDeAMP(urlObj)
    if (amp) {
      return amp
    }
  }

  if (urlCleaningStripParams(urlObj)) {
    return urlObj.toString()
  }
  return null
}
