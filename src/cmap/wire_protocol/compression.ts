import { Snappy, kModuleError } from '../../deps';
import zlib = require('zlib');
import type { Callback } from '../../types';
import type { CommandResult } from '../commands';
import type { OperationDescription } from '../message_stream';

const compressorIDs = {
  snappy: 1,
  zlib: 2
};

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
function compress(
  self: { options: OperationDescription & zlib.ZlibOptions },
  dataToBeCompressed: Buffer,
  callback: Callback<Buffer>
): void {
  const zlibOptions = {} as zlib.ZlibOptions;
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
      if (self.options.zlibCompressionLevel) {
        zlibOptions.level = self.options.zlibCompressionLevel;
      }
      zlib.deflate(dataToBeCompressed, zlibOptions, callback as zlib.CompressCallback);
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
function decompress(
  compressorID: number,
  compressedData: Buffer,
  callback: Callback<Buffer>
): void {
  if (compressorID < 0 || compressorID > Math.max(...Object.values(compressorIDs))) {
    throw new Error(
      `Server sent message compressed using an unsupported compressor.` +
        ` (Received compressor ID ${compressorID})`
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
      zlib.inflate(compressedData, callback as zlib.CompressCallback);
      break;
    default:
      callback(undefined, compressedData);
  }
}

export { compressorIDs, uncompressibleCommands, compress, decompress };
