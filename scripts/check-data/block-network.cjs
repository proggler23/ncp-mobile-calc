// Preloaded with NODE_OPTIONS="--require <this file>" (see `npm run build:offline`): makes any
// outbound (non-loopback) network access from the build process throw. Proves that the deploy
// build only uses committed files.
'use strict'
const net = require('node:net')
const dns = require('node:dns')

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/i
const blocked = (host) => new Error(`build:offline - network access blocked (${host})`)

const origConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const a = args[0]
  // net normalizes to (options, cb); connect(port, host) / connect(path) are the other forms
  const host = a && typeof a === 'object' ? a.host : typeof a === 'number' ? args[1] : undefined
  if (host && !LOCAL.test(String(host))) throw blocked(host)
  return origConnect.apply(this, args)
}
const origLookup = dns.lookup
dns.lookup = function (hostname, ...rest) {
  if (hostname && !LOCAL.test(hostname)) {
    const cb = rest[rest.length - 1]
    const err = blocked(hostname)
    if (typeof cb === 'function') return process.nextTick(cb, err)
    throw err
  }
  return origLookup.call(this, hostname, ...rest)
}
if (typeof globalThis.fetch === 'function') {
  const origFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (!LOCAL.test(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'file:')
      throw blocked(u.hostname)
    return origFetch(input, init)
  }
}
