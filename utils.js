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

// Grab Kerberos values if they exist, otherwise set them to null
let Kerberos = null;
let MongoAuthProcess = null;

try {
  const kerberos = requireOptional('kerberos');
  if (kerberos) {
    Kerberos = kerberos.Kerberos;
    MongoAuthProcess = kerberos.processes.MongoAuthProcess;
  }
} catch (err) {
  console.warn(err.message);
}

// Throw an error if an attempt to use EJSON is made when it is not installed
const noEJSONError = function() {
  throw new Error('The `mongodb-extjson` package was not found. Please install it and try again.');
};

// Facilitate loading EJSON optionally
const retrieveEJSON = function() {
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
};

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
  Kerberos,
  MongoAuthProcess,
  collationNotSupported,
  retrieveEJSON
};
