/*
DNS-over-HTTPS, controlled by the `dnsOverHttps` setting
({mode: 'off' | 'automatic' | 'secure', provider, customTemplate}). Applied
through app.configureHostResolver, so a settings change takes effect without a
restart. Default: automatic mode with Cloudflare.
*/

/* global app, settings */

const secureDnsTemplates = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
  google: 'https://dns.google/dns-query',
  nextdns: 'https://dns.nextdns.io'
}

function secureDnsTemplateIsValid (template) {
  try {
    var parsed = new URL(template)
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
  } catch (e) {
    return false
  }
}

function secureDnsServersFor (value) {
  if (!value) {
    return [secureDnsTemplates.cloudflare]
  }
  var template
  if (value.provider === 'custom') {
    template = typeof value.customTemplate === 'string' ? value.customTemplate.trim() : ''
    if (!secureDnsTemplateIsValid(template)) {
      template = ''
    }
  } else {
    template = secureDnsTemplates[value.provider]
  }
  return template ? [template] : []
}

function secureDnsApply () {
  var value = settings.get('dnsOverHttps')
  var mode = value && ['off', 'automatic', 'secure'].includes(value.mode) ? value.mode : 'automatic'
  var servers = mode === 'off' ? [] : secureDnsServersFor(value)
  if (mode !== 'off' && servers.length === 0) {
    mode = 'off'
  }

  try {
    app.configureHostResolver(mode === 'off' ? { secureDnsMode: 'off' } : { secureDnsMode: mode, secureDnsServers: servers })
  } catch (e) {
    console.warn('failed to configure secure DNS', e)
  }
}

app.whenReady().then(secureDnsApply)

settings.listen('dnsOverHttps', function () {
  if (app.isReady()) {
    secureDnsApply()
  }
})
