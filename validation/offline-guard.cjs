/* eslint-disable @typescript-eslint/no-require-imports */
// Validation-only guard; never loaded by the application in a release.
const net = require('node:net');
const {syncBuiltinESMExports} = require('node:module');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let value = args[0];
  if (Array.isArray(value)) value = value[0];
  const host = value && typeof value === 'object' ? value.host : typeof args[1] === 'string' ? args[1] : undefined;
  const pipe = value && typeof value === 'object' ? value.path : typeof value === 'string' && !/^\d+$/.test(value) ? value : undefined;
  if (host === 'fixture.invalid' && typeof value.lookup === 'function') {
    const lookup = value.lookup;
    value.lookup = (name, options, callback) => lookup(name, options, (error, address, family) => {
      if (error) return callback(error);
      if (address !== '127.0.0.1' && address !== '::1') return callback(new Error('RELEASE_VALIDATION_NON_LOOPBACK_FIXTURE_DENIED'));
      callback(null, address, family);
    });
    return connect.apply(this, args);
  }
  if (!pipe && host && !['localhost','127.0.0.1','::1','[::1]'].includes(host)) {
    process.stderr.write('Blocked external connection host: ' + host + '\n');
    throw new Error('RELEASE_VALIDATION_EXTERNAL_NETWORK_DENIED');
  }
  return connect.apply(this, args);
};
syncBuiltinESMExports();
