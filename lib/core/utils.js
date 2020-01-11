'use strict';
const os = require('os');
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

/**
 * A helper function for determining `maxWireVersion` between legacy and new topology
 * instances
 *
 * @private
 * @param {(Topology|Server)} topologyOrServer
 */
function maxWireVersion(topologyOrServer) {
  if (topologyOrServer.ismaster) {
    return topologyOrServer.ismaster.maxWireVersion;
  }

  if (typeof topologyOrServer.lastIsMaster === 'function') {
    const lastIsMaster = topologyOrServer.lastIsMaster();
    if (lastIsMaster) {
      return lastIsMaster.maxWireVersion;
    }
  }

  if (topologyOrServer.description) {
    return topologyOrServer.description.maxWireVersion;
  }

  return null;
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
  return cmd && cmd.collation && maxWireVersion(server) < 5;
}

/**
 * Checks if a given value is a Promise
 *
 * @param {*} maybePromise
 * @return true if the provided value is a Promise
 */
function isPromiseLike(maybePromise) {
  return maybePromise && typeof maybePromise.then === 'function';
}

/**
 * Applies the function `eachFn` to each item in `arr`, in parallel.
 *
 * @param {array} arr an array of items to asynchronusly iterate over
 * @param {function} eachFn A function to call on each item of the array. The callback signature is `(item, callback)`, where the callback indicates iteration is complete.
 * @param {function} callback The callback called after every item has been iterated
 */
function eachAsync(arr, eachFn, callback) {
  arr = arr || [];

  let idx = 0;
  let awaiting = 0;
  for (idx = 0; idx < arr.length; ++idx) {
    awaiting++;
    eachFn(arr[idx], eachCallback);
  }

  if (awaiting === 0) {
    callback();
    return;
  }

  function eachCallback(err) {
    awaiting--;
    if (err) {
      callback(err);
      return;
    }

    if (idx === arr.length && awaiting <= 0) {
      callback();
    }
  }
}

function isUnifiedTopology(topology) {
  return topology.description != null;
}

function arrayStrictEqual(arr, arr2) {
  if (!Array.isArray(arr) || !Array.isArray(arr2)) {
    return false;
  }

  return arr.length === arr2.length && arr.every((elt, idx) => elt === arr2[idx]);
}

function tagsStrictEqual(tags, tags2) {
  const tagsKeys = Object.keys(tags);
  const tags2Keys = Object.keys(tags2);
  return tagsKeys.length === tags2Keys.length && tagsKeys.every(key => tags2[key] === tags[key]);
}

function errorStrictEqual(lhs, rhs) {
  if (lhs === rhs) {
    return true;
  }

  if ((lhs == null && rhs != null) || (lhs != null && rhs == null)) {
    return false;
  }

  if (lhs.constructor.name !== rhs.constructor.name) {
    return false;
  }

  if (lhs.message !== rhs.message) {
    return false;
  }

  return true;
}

function makeStateMachine(stateTable) {
  return function stateTransition(target, newState) {
    const legalStates = stateTable[target.s.state];
    if (legalStates && legalStates.indexOf(newState) < 0) {
      throw new TypeError(
        `illegal state transition from [${target.s.state}] => [${newState}], allowed: [${legalStates}]`
      );
    }

    target.emit('stateChanged', target.s.state, newState);
    target.s.state = newState;
  };
}

function makeClientMetadata(options) {
  options = options || {};

  const metadata = {
    driver: {
      name: 'nodejs',
      version: require('../../package.json').version
    },
    os: {
      type: os.type(),
      name: process.platform,
      architecture: process.arch,
      version: os.release()
    },
    platform: `'Node.js ${process.version}, ${os.endianness} (${
      options.useUnifiedTopology ? 'unified' : 'legacy'
    })`
  };

  // support optionally provided wrapping driver info
  if (options.driverInfo) {
    if (options.driverInfo.name) {
      metadata.driver.name = `${metadata.driver.name}|${options.driverInfo.name}`;
    }

    if (options.driverInfo.version) {
      metadata.version = `${metadata.driver.version}|${options.driverInfo.version}`;
    }

    if (options.driverInfo.platform) {
      metadata.platform = `${metadata.platform}|${options.driverInfo.platform}`;
    }
  }

  if (options.appname) {
    // MongoDB requires the appname not exceed a byte length of 128
    const buffer = Buffer.from(options.appname);
    metadata.application = {
      name: buffer.length > 128 ? buffer.slice(0, 128).toString('utf8') : options.appname
    };
  }

  return metadata;
}

module.exports = {
  uuidV4,
  calculateDurationInMs,
  relayEvents,
  collationNotSupported,
  retrieveEJSON,
  retrieveKerberos,
  maxWireVersion,
  isPromiseLike,
  eachAsync,
  isUnifiedTopology,
  arrayStrictEqual,
  tagsStrictEqual,
  errorStrictEqual,
  makeStateMachine,
  makeClientMetadata
};
