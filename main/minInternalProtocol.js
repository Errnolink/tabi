const { pathToFileURL } = require('url')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'min',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

const minInternalCSP = 'script-src \'self\'; object-src \'none\'; frame-ancestors \'none\''

function minInternalResponse (body, init) {
  const headers = new Headers(init && init.headers)
  headers.set('content-security-policy', minInternalCSP)
  return new Response(body, Object.assign({}, init, { headers: headers }))
}

function minInternalResponseFrom (res) {
  const headers = new Headers(res.headers)
  headers.set('content-security-policy', minInternalCSP)
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: headers
  })
}

function minInternalRequestIsFromViewer (req) {
  let referrer = ''
  try {
    referrer = req.referrer || ''
  } catch (e) { }
  if (referrer.startsWith('min://app/pages/pdfViewer')) {
    return true
  }
  let refererHeader = ''
  try {
    refererHeader = req.headers.get('referer') || ''
  } catch (e) { }
  if (refererHeader.startsWith('min://app/pages/pdfViewer')) {
    return true
  }
  try {
    return req.headers.get('sec-fetch-site') === 'same-origin'
  } catch (e) {
    return false
  }
}

function minInternalPDFTarget (targetUrl) {
  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch (e) {
    return null
  }
  if (parsed.protocol !== 'file:' || parsed.host !== '' || parsed.username || parsed.password) {
    return null
  }
  if (!/\.pdf$/i.test(parsed.pathname)) {
    return null
  }
  return parsed
}

async function minInternalPDFFile (req, searchParams) {
  const targetUrl = searchParams.get('url')
  if (!targetUrl || !minInternalRequestIsFromViewer(req) || !minInternalPDFTarget(targetUrl)) {
    return minInternalResponse('forbidden', { status: 403 })
  }
  try {
    return minInternalResponseFrom(await net.fetch(targetUrl))
  } catch (e) {
    return minInternalResponse('not found', { status: 404 })
  }
}

function registerBundleProtocol (ses) {
  ses.protocol.handle('min', async (req) => {
    const parsed = new URL(req.url)
    const host = parsed.host
    let pathname = parsed.pathname
    const searchParams = parsed.searchParams

    if (pathname.charAt(0) === '/') {
      pathname = pathname.substring(1)
    }

    if (host !== 'app') {
      return minInternalResponse('bad', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    }

    if (pathname === 'pdf-file') {
      return minInternalPDFFile(req, searchParams)
    }

    const pathToServe = path.resolve(__dirname, pathname)
    const relativePath = path.relative(__dirname, pathToServe)
    const isSafe = relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)

    if (!isSafe) {
      return minInternalResponse('bad', {
        status: 400,
        headers: { 'content-type': 'text/html' }
      })
    }
    const res = await net.fetch(pathToFileURL(pathToServe).toString())
    if (pathname.endsWith('.mjs')) {
      const headers = new Headers(res.headers)
      headers.set('content-type', 'text/javascript')
      return minInternalResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: headers
      })
    }
    return minInternalResponseFrom(res)
  })
}

app.on('session-created', (ses) => {
  if (ses !== session.defaultSession) {
    registerBundleProtocol(ses)
  }
})
