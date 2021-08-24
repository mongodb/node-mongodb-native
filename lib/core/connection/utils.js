'use strict';

const parsePackageVersion = require('../../utils').parsePackageVersion;
const emitWarningOnce = require('../../utils').emitWarningOnce;

const require_optional = require('optional-require')(require);

function debugOptions(debugFields, options) {
  const finaloptions = {};
  debugFields.forEach(function(n) {
    finaloptions[n] = options[n];
  });

  return finaloptions;
}

function retrieveBSON() {
  const BSON = require('bson');
  BSON.native = false;

  const optionalBSON = require_optional('bson-ext');
  const bsonExtVersion = parsePackageVersion(
    require_optional('bson-ext/package.json') || { version: '0.0.0' }
  );
  if (bsonExtVersion.major >= 4) {
    emitWarningOnce(
      'bson-ext version 4 and above does not work with the 3.x version of the mongodb driver'
    );
  }
  if (optionalBSON) {
    optionalBSON.native = true;
    return optionalBSON;
  }

  return BSON;
}

// Throw an error if an attempt to use Snappy is made when Snappy is not installed
function noSnappyWarning() {
  throw new Error(
    'Attempted to use Snappy compression, but Snappy is not installed. Install or disable Snappy compression and try again.'
  );
}

const PKG_VERSION = Symbol('kPkgVersion');

// Facilitate loading Snappy optionally
function retrieveSnappy() {
  const snappy = require_optional('snappy');
  if (!snappy) {
    return {
      compress: noSnappyWarning,
      uncompress: noSnappyWarning,
      compressSync: noSnappyWarning,
      uncompressSync: noSnappyWarning
    };
  }

  const snappyPkg = require_optional('snappy/package.json') || { version: '0.0.0' };
  const version = parsePackageVersion(snappyPkg);
  snappy[PKG_VERSION] = version;
  if (version.major >= 7) {
    const compressOriginal = snappy.compress;
    const uncompressOriginal = snappy.uncompress;
    snappy.compress = (data, callback) => {
      compressOriginal(data)
        .then(res => callback(undefined, res))
        .catch(error => callback(error));
    };
    snappy.uncompress = (data, callback) => {
      uncompressOriginal(data)
        .then(res => callback(undefined, res))
        .catch(error => callback(error));
    };
  }

  return snappy;
}

module.exports = {
  PKG_VERSION,
  debugOptions,
  retrieveBSON,
  retrieveSnappy
};
