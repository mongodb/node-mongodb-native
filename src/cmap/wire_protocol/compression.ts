import { Snappy, kModuleError } from '../../deps';
import zlib = require('zlib');

const compressorIDs = {
  snappy: 1,
  zlib: 2
} as any;

const uncompressibleCommands = new Set([
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
]);

// Facilitate compressing a message using an agreed compressor
function compress(self: any, dataToBeCompressed: any, callback: Function) {
  switch (self.options.agreedCompressor) {
    case 'snappy':
      if (Snappy[kModuleError]) {
        callback(Snappy[kModuleError]);
        return;
      }
      Snappy.compress(dataToBeCompressed, callback);
      break;
    case 'zlib':
      // Determine zlibCompressionLevel
      var zlibOptions = {} as any;
      if (self.options.zlibCompressionLevel) {
        zlibOptions.level = self.options.zlibCompressionLevel;
      }
      zlib.deflate(dataToBeCompressed, zlibOptions, callback as any);
      break;
    default:
      throw new Error(
        'Attempt to compress message using unknown compressor "' +
          self.options.agreedCompressor +
          '".'
      );
  }
}

// Decompress a message using the given compressor
function decompress(compressorID: any, compressedData: any, callback: Function) {
  if (compressorID < 0 || compressorID > compressorIDs.length) {
    throw new Error(
      'Server sent message compressed using an unsupported compressor. (Received compressor ID ' +
        compressorID +
        ')'
    );
  }

  switch (compressorID) {
    case compressorIDs.snappy:
      if (Snappy[kModuleError]) {
        callback(Snappy[kModuleError]);
        return;
      }
      Snappy.uncompress(compressedData, callback);
      break;
    case compressorIDs.zlib:
      zlib.inflate(compressedData, callback as any);
      break;
    default:
      callback(null, compressedData);
  }
}

export { compressorIDs, uncompressibleCommands, compress, decompress };
