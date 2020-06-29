'use strict';

const kModuleError = Symbol('moduleError');

function makeErrorModule(error) {
  const props = error ? { [kModuleError]: error } : {};
  return new Proxy(props, {
    get: (_, key) => {
      if (key === kModuleError) {
        return error;
      }
      throw error;
    },
    set: () => {
      throw error;
    }
  });
}

let BSON = require('bson');
try {
  BSON = require('bson-ext');
} catch (_) {} // eslint-disable-line

let Kerberos = makeErrorModule(
  new Error(
    'Optional module `kerberos` not found. Please install it to enable kerberos authentication'
  )
);
try {
  Kerberos = require('kerberos');
} catch (_) {} // eslint-disable-line

let Snappy = makeErrorModule(
  new Error('Optional module `snappy` not found. Please install it to enable snappy compression')
);
try {
  Snappy = require('snappy');
} catch (_) {} // eslint-disable-line

module.exports = { BSON, Kerberos, Snappy, kModuleError };
