'use strict';

const crypto = require('crypto');
const requireOptional = require('require_optional');

/**
 * Generate a UUIDv4
 */
const uuidV4 = () => {
  const result = crypto.randomBytes(16);
  result[6] = (result[6] & 0x0f) | 0x40;
  result[8] = (result[8] & 0x3f) | 0x80;
  return result;
};

/**
 * Returns the duration calculated from two high resolution timers in milliseconds
 *
 * @param {Object} started A high resolution timestamp created from `process.hrtime()`
 * @returns {Number} The duration in milliseconds
 */
const calculateDurationInMs = started => {
  const hrtime = process.hrtime(started);
  return (hrtime[0] * 1e9 + hrtime[1]) / 1e6;
};

/**
 * Relays events for a given listener and emitter
 *
 * @param {EventEmitter} listener the EventEmitter to listen to the events from
 * @param {EventEmitter} emitter the EventEmitter to relay the events to
 */
function relayEvents(listener, emitter, events) {
  events.forEach(eventName => listener.on(eventName, event => emitter.emit(eventName, event)));
}

function retrieveKerberos() {
  let kerberos;

  try {
    kerberos = requireOptional('kerberos');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error('The `kerberos` module was not found. Please install it and try again.');
    }

    throw err;
  }

  return kerberos;
}

// Throw an error if an attempt to use EJSON is made when it is not installed
const noEJSONError = function() {
  throw new Error('The `mongodb-extjson` module was not found. Please install it and try again.');
};

// Facilitate loading EJSON optionally
function retrieveEJSON() {
  let EJSON = null;
  try {
    EJSON = requireOptional('mongodb-extjson');
  } catch (error) {} // eslint-disable-line
  if (!EJSON) {
    EJSON = {
      parse: noEJSONError,
      deserialize: noEJSONError,
      serialize: noEJSONError,
      stringify: noEJSONError,
      setBSONModule: noEJSONError,
      BSON: noEJSONError
    };
  }

  return EJSON;
}

/*
 * Checks that collation is supported by server.
 *
 * @param {Server} [server] to check against
 * @param {object} [cmd] object where collation may be specified
 * @param {function} [callback] callback function
 * @return true if server does not support collation
 */
function collationNotSupported(server, cmd) {
  return cmd && cmd.collation && server.ismaster && server.ismaster.maxWireVersion < 5;
}

module.exports = {
  uuidV4,
  calculateDurationInMs,
  relayEvents,
  collationNotSupported,
  retrieveEJSON,
  retrieveKerberos
};
