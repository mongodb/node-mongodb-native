'use strict';

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

// Facilitate loading Snappy optionally
function retrieveSnappy() {
  let snappy = require_optional('snappy');
  if (!snappy) {
    snappy = {
      compress: noSnappyWarning,
      uncompress: noSnappyWarning,
      compressSync: noSnappyWarning,
      uncompressSync: noSnappyWarning
    };
  }
  return snappy;
}

module.exports = {
  debugOptions,
  retrieveBSON,
  retrieveSnappy
};
