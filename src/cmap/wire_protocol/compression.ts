import { promisify } from 'util';
import * as zlib from 'zlib';

import { LEGACY_HELLO_COMMAND } from '../../constants';
import { Snappy, ZStandard } from '../../deps';
import { MongoDecompressionError, MongoInvalidArgumentError } from '../../error';

/** @public */
export const Compressor = Object.freeze({
  none: 0,
  snappy: 1,
  zlib: 2,
  zstd: 3
} as const);

/** @public */
export type Compressor = (typeof Compressor)[CompressorName];

/** @public */
export type CompressorName = keyof typeof Compressor;

export const uncompressibleCommands = new Set([
  LEGACY_HELLO_COMMAND,
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

const ZSTD_COMPRESSION_LEVEL = 3;

const zlibInflate = promisify(zlib.inflate.bind(zlib));
const zlibDeflate = promisify(zlib.deflate.bind(zlib));

// Facilitate compressing a message using an agreed compressor
export async function compress(
  options: { zlibCompressionLevel: number; agreedCompressor: CompressorName },
  dataToBeCompressed: Buffer
): Promise<Buffer> {
  const zlibOptions = {} as zlib.ZlibOptions;
  switch (options.agreedCompressor) {
    case 'snappy':
      if ('kModuleError' in Snappy) {
        throw Snappy['kModuleError'];
      }
      return Snappy.compress(dataToBeCompressed);

    case 'zstd':
      if ('kModuleError' in ZStandard) {
        throw ZStandard['kModuleError'];
      }
      return ZStandard.compress(dataToBeCompressed, ZSTD_COMPRESSION_LEVEL);

    case 'zlib':
      if (options.zlibCompressionLevel) {
        zlibOptions.level = options.zlibCompressionLevel;
      }
      return zlibDeflate(dataToBeCompressed, zlibOptions);

    default:
      throw new MongoInvalidArgumentError(
        `Unknown compressor ${options.agreedCompressor} failed to compress`
      );
  }
}

// Decompress a message using the given compressor
export async function decompress(compressorID: number, compressedData: Buffer): Promise<Buffer> {
  if (
    compressorID !== Compressor.snappy &&
    compressorID !== Compressor.zstd &&
    compressorID !== Compressor.zlib &&
    compressorID !== Compressor.none
  ) {
    throw new MongoDecompressionError(
      `Server sent message compressed using an unsupported compressor. (Received compressor ID ${compressorID})`
    );
  }

  switch (compressorID) {
    case Compressor.snappy:
      if ('kModuleError' in Snappy) {
        throw Snappy['kModuleError'];
      }
      return Snappy.uncompress(compressedData, { asBuffer: true });

    case Compressor.zstd:
      if ('kModuleError' in ZStandard) {
        throw ZStandard['kModuleError'];
      }
      return ZStandard.decompress(compressedData);

    case Compressor.zlib:
      return zlibInflate(compressedData);

    default:
      return compressedData;
  }
}
