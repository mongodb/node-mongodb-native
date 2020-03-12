'use strict';

function makeErrorModule(error) {
  return new Proxy(
    {},
    {
      get: () => {
        throw error;
      },
      set: () => {
        throw error;
      }
    }
  );
}

function retrieveKerberos() {
  try {
    return require('kerberos');
  } catch (err) {
    const noKerberosError = new Error(
      'The `kerberos` module was not found. Please install it and try again.'
    );
    return makeErrorModule(noKerberosError);
  }
}

// Facilitate loading EJSON optionally
function retrieveEJSON() {
  try {
    return require('mongodb-extjson');
  } catch (error) {} // eslint-disable-line

  // Throw an error if an attempt to use EJSON is made when it is not installed
  const noEJSONError = new Error(
    'The `mongodb-extjson` module was not found. Please install it and try again.'
  );
  return makeErrorModule(noEJSONError);
}

function retrieveBSON() {
  const BSON = require('bson');
  BSON.native = false;

  try {
    const optionalBSON = require('bson-ext');
    if (optionalBSON) {
      optionalBSON.native = true;
      return optionalBSON;
    }
  } catch (err) {} // eslint-disable-line

  return BSON;
}

// Facilitate loading Snappy optionally
function retrieveSnappy() {
  // Throw an error if an attempt to use Snappy is made when Snappy is not installed
  try {
    return require('snappy');
  } catch (error) {} // eslint-disable-line

  const noSnappyError = new Error(
    'Attempted to use Snappy compression, but Snappy is not installed. Install or disable Snappy compression and try again.'
  );
  return makeErrorModule(noSnappyError);
}

/**
 * @type {import('bson')}
 */
const BSON = retrieveBSON();
/**
 * @type {import('bson').EJSON}
 */
const EJSON = retrieveEJSON();
/**
 * @type {import('kerberose')}
 */
const Kerberos = retrieveKerberos();
/**
 * @type {import('snappy')}
 */
const Snappy = retrieveSnappy();

module.exports = { BSON, EJSON, Kerberos, Snappy };
