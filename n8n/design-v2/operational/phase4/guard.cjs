'use strict';
// Loaded only by local validation processes; never by app or workflow runtime.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' && first !== null ? first : { port: first, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  const host = options.host || 'localhost';
  if (options.path || !['localhost','127.0.0.1','::1','[::1]'].includes(host)) throw new Error('PHASE4_EXTERNAL_CONNECTION_BLOCKED');
  return original.apply(this, args);
};
const pg = require('../../../../backend/node_modules/pg');
pg.Client.prototype.connect = function () { throw new Error('PHASE4_REAL_DATABASE_BLOCKED'); };
// Prevent loading real .env files. Versioned examples remain readable for tests.
const fs = require('node:fs');
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  if (typeof file === 'string' && /(?:^|[\\/])\.env(?:\.[^\\/]+)?$/.test(file) && !/\.example$/.test(file)) throw new Error('PHASE4_REAL_ENV_BLOCKED');
  return read.call(this, file, ...args);
};
