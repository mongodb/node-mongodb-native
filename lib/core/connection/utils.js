'use strict';

const require_optional = require('require_optional');

function debugOptions(debugFields, options) {
  var finaloptions = {};
  debugFields.forEach(function(n) {
    finaloptions[n] = options[n];
  });

  return finaloptions;
}

function retrieveBSON() {
  var BSON = require('bson');
  BSON.native = false;

  try {
    var optionalBSON = require_optional('bson-ext');
    if (optionalBSON) {
      optionalBSON.native = true;
      return optionalBSON;
    }
  } catch (err) {} // eslint-disable-line

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
  var snappy = null;
  try {
    snappy = require_optional('snappy');
  } catch (error) {} // eslint-disable-line
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
