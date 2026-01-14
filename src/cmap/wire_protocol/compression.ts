import * as zlib from 'zlib';

import { concatBuffers, readInt32LE } from '../../bson';
import { LEGACY_HELLO_COMMAND } from '../../constants';
import { getSnappy, getZstdLibrary, type SnappyLib, type ZStandard } from '../../deps';
import { MongoDecompressionError, MongoInvalidArgumentError } from '../../error';
import {
  type MessageHeader,
  OpCompressedRequest,
  type OpCompressesRequestOptions,
  OpMsgResponse,
  OpReply,
  type WriteProtocolMessageType
} from '../commands';
import { OP_COMPRESSED, OP_MSG } from './constants';

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

const zlibInflate = (buf: zlib.InputType) => {
  return new Promise<Buffer>((resolve, reject) => {
    zlib.inflate(buf, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

const zlibDeflate = (buf: zlib.InputType, options: zlib.ZlibOptions) => {
  return new Promise<Buffer>((resolve, reject) => {
    zlib.deflate(buf, options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

let zstd: ZStandard;
let Snappy: SnappyLib | null = null;
function loadSnappy() {
  if (Snappy == null) {
    const snappyImport = getSnappy();
    if ('kModuleError' in snappyImport) {
      throw snappyImport.kModuleError;
    }
    Snappy = snappyImport;
  }
  return Snappy;
}

// Facilitate compressing a message using an agreed compressor
export async function compress(
  options: OpCompressesRequestOptions,
  dataToBeCompressed: Buffer
): Promise<Buffer> {
  const zlibOptions = {} as zlib.ZlibOptions;
  switch (options.agreedCompressor) {
    case 'snappy': {
      Snappy ??= loadSnappy();
      return await Snappy.compress(dataToBeCompressed);
    }
    case 'zstd': {
      loadZstd();
      if ('kModuleError' in zstd) {
        throw zstd['kModuleError'];
      }
      return await zstd.compress(dataToBeCompressed, ZSTD_COMPRESSION_LEVEL);
    }
    case 'zlib': {
      if (options.zlibCompressionLevel) {
        zlibOptions.level = options.zlibCompressionLevel;
      }
      return await zlibDeflate(dataToBeCompressed, zlibOptions);
    }
    default: {
      throw new MongoInvalidArgumentError(
        `Unknown compressor ${options.agreedCompressor} failed to compress`
      );
    }
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
    case Compressor.snappy: {
      Snappy ??= loadSnappy();
      return await Snappy.uncompress(compressedData, { asBuffer: true });
    }
    case Compressor.zstd: {
      loadZstd();
      if ('kModuleError' in zstd) {
        throw zstd['kModuleError'];
      }
      return await zstd.decompress(compressedData);
    }
    case Compressor.zlib: {
      return await zlibInflate(compressedData);
    }
    default: {
      return compressedData;
    }
  }
}

/**
 * Load ZStandard if it is not already set.
 */
function loadZstd() {
  if (!zstd) {
    zstd = getZstdLibrary();
  }
}

const MESSAGE_HEADER_SIZE = 16;

/**
 * @internal
 *
 * Compresses an OP_MSG or OP_QUERY message, if compression is configured.  This method
 * also serializes the command to BSON.
 */
export async function compressCommand(
  command: WriteProtocolMessageType,
  description: { agreedCompressor?: CompressorName; zlibCompressionLevel?: number }
): Promise<Buffer> {
  const finalCommand =
    description.agreedCompressor === 'none' || !OpCompressedRequest.canCompress(command)
      ? command
      : new OpCompressedRequest(command, {
          agreedCompressor: description.agreedCompressor ?? 'none',
          zlibCompressionLevel: description.zlibCompressionLevel ?? 0
        });
  const data = await finalCommand.toBin();
  return concatBuffers(data);
}

/**
 * @internal
 *
 * Decompresses an OP_MSG or OP_QUERY response from the server, if compression is configured.
 *
 * This method does not parse the response's BSON.
 */
export async function decompressResponse(message: Buffer): Promise<OpMsgResponse | OpReply> {
  const messageHeader: MessageHeader = {
    length: readInt32LE(message, 0),
    requestId: readInt32LE(message, 4),
    responseTo: readInt32LE(message, 8),
    opCode: readInt32LE(message, 12)
  };

  if (messageHeader.opCode !== OP_COMPRESSED) {
    const ResponseType = messageHeader.opCode === OP_MSG ? OpMsgResponse : OpReply;
    const messageBody = message.subarray(MESSAGE_HEADER_SIZE);
    return new ResponseType(message, messageHeader, messageBody);
  }

  const header: MessageHeader = {
    ...messageHeader,
    fromCompressed: true,
    opCode: readInt32LE(message, MESSAGE_HEADER_SIZE),
    length: readInt32LE(message, MESSAGE_HEADER_SIZE + 4)
  };
  const compressorID = message[MESSAGE_HEADER_SIZE + 8];
  const compressedBuffer = message.slice(MESSAGE_HEADER_SIZE + 9);

  // recalculate based on wrapped opcode
  const ResponseType = header.opCode === OP_MSG ? OpMsgResponse : OpReply;
  const messageBody = await decompress(compressorID, compressedBuffer);
  if (messageBody.length !== header.length) {
    throw new MongoDecompressionError('Message body and message header must be the same length');
  }
  return new ResponseType(message, header, messageBody);
}
