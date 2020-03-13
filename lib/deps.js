'use strict';

const kModuleError = Symbol('Error Loading Module');

function makeErrorModule(error) {
  return new Proxy(
    { [kModuleError]: error },
    {
      get: (_, key) => {
        if (key === kModuleError) {
          return error;
        }
        throw error;
      },
      set: () => {
        throw error;
      }
    }
  );
}

let BSON = require('bson');
try {
  BSON = require('bson-ext');
} catch (_) {} // eslint-disable-line

let Kerberos = makeErrorModule(new Error('`kerberos` module not found. Install it or disable it.'));
try {
  Kerberos = require('kerberos');
} catch (_) {} // eslint-disable-line

let Snappy = makeErrorModule(new Error('`snappy` module not found. Install it or disable it.'));
try {
  Snappy = require('snappy');
} catch (_) {} // eslint-disable-line

module.exports = { BSON, Kerberos, Snappy, kModuleError };
