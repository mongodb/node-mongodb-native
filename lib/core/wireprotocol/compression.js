'use strict';

var Snappy = require('../connection/utils').retrieveSnappy(),
  zlib = require('zlib');

var compressorIDs = {
  snappy: 1,
  zlib: 2
};

var uncompressibleCommands = [
  'ismaster',
  'saslStart',
  'saslContinue',
  'getnonce',
  'authenticate',
  'createUser',
  'updateUser',
  'copydbSaslStart',
  'copydbgetnonce',
  'copydb'
];

// Facilitate compressing a message using an agreed compressor
var compress = function(self, dataToBeCompressed, callback) {
  switch (self.options.agreedCompressor) {
    case 'snappy':
      Snappy.compress(dataToBeCompressed, callback);
      break;
    case 'zlib':
      // Determine zlibCompressionLevel
      var zlibOptions = {};
      if (self.options.zlibCompressionLevel) {
        zlibOptions.level = self.options.zlibCompressionLevel;
      }
      zlib.deflate(dataToBeCompressed, zlibOptions, callback);
      break;
    default:
      throw new Error(
        'Attempt to compress message using unknown compressor "' +
          self.options.agreedCompressor +
          '".'
      );
  }
};

// Decompress a message using the given compressor
var decompress = function(compressorID, compressedData, callback) {
  if (compressorID < 0 || compressorID > compressorIDs.length) {
    throw new Error(
      'Server sent message compressed using an unsupported compressor. (Received compressor ID ' +
        compressorID +
        ')'
    );
  }
  switch (compressorID) {
    case compressorIDs.snappy:
      Snappy.uncompress(compressedData, callback);
      break;
    case compressorIDs.zlib:
      zlib.inflate(compressedData, callback);
      break;
    default:
      callback(null, compressedData);
  }
};

module.exports = {
  compressorIDs: compressorIDs,
  uncompressibleCommands: uncompressibleCommands,
  compress: compress,
  decompress: decompress
};
