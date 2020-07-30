import zlib = require('zlib');
import type { Callback } from '../../types';
import type { OperationDescription } from '../message_stream';
import { MongoError } from '../../error';
import type { bufferCallback } from 'snappy';

export enum Compressor {
  snappy = 1,
  zlib = 2
}
export type CompressorName = keyof typeof Compressor;

export const uncompressibleCommands = new Set([
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
export function compress(
  self: { options: OperationDescription & zlib.ZlibOptions },
  dataToBeCompressed: Buffer,
  callback: Callback<Buffer>
): void {
  const zlibOptions = {} as zlib.ZlibOptions;
  switch (self.options.agreedCompressor) {
    case 'snappy':
      import('snappy')
        .then(Snappy => {
          Snappy.compress(dataToBeCompressed, callback as bufferCallback);
        })
        .catch(() => {
          callback(
            new MongoError(
              'Optional module `snappy` not found. Please install it to enable snappy compression'
            )
          );
        });
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
export function decompress(
  compressorID: Compressor,
  compressedData: Buffer,
  callback: Callback<Buffer>
): void {
  if (compressorID < 0 || compressorID > Math.max(2)) {
    throw new Error(
      `Server sent message compressed using an unsupported compressor.` +
        ` (Received compressor ID ${compressorID})`
    );
  }

  switch (compressorID) {
    case Compressor.snappy:
      import('snappy')
        .then(Snappy => {
          Snappy.uncompress(compressedData, callback as bufferCallback);
        })
        .catch(() => {
          callback(
            new MongoError(
              'Optional module `snappy` not found. Please install it to enable snappy compression'
            )
          );
        });
      break;
    case Compressor.zlib:
      zlib.inflate(compressedData, callback as zlib.CompressCallback);
      break;
    default:
      callback(undefined, compressedData);
  }
}
