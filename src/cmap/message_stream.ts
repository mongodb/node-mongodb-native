import { Duplex, type DuplexOptions } from 'stream';

import type { BSONSerializeOptions, Document } from '../bson';
import { MongoDecompressionError, MongoParseError } from '../error';
import type { ClientSession } from '../sessions';
import { BufferPool, type Callback } from '../utils';
import {
  type MessageHeader,
  OpCompressedRequest,
  OpMsgResponse,
  OpQueryResponse,
  type WriteProtocolMessageType
} from './commands';
import { compress, Compressor, type CompressorName, decompress } from './wire_protocol/compression';
import { OP_COMPRESSED, OP_MSG } from './wire_protocol/constants';

const MESSAGE_HEADER_SIZE = 16;
const COMPRESSION_DETAILS_SIZE = 9; // originalOpcode + uncompressedSize, compressorID

const kDefaultMaxBsonMessageSize = 1024 * 1024 * 16 * 4;
/** @internal */
const kBuffer = Symbol('buffer');

/** @internal */
export interface MessageStreamOptions extends DuplexOptions {
  maxBsonMessageSize?: number;
}

/** @internal */
export interface OperationDescription extends BSONSerializeOptions {
  started: number;
  cb: Callback<Document>;
  documentsReturnedIn?: string;
  noResponse: boolean;
  raw: boolean;
  requestId: number;
  session?: ClientSession;
  agreedCompressor?: CompressorName;
  zlibCompressionLevel?: number;
  $clusterTime?: Document;
}

/**
 * A duplex stream that is capable of reading and writing raw wire protocol messages, with
 * support for optional compression
 * @internal
 */
export class MessageStream extends Duplex {
  /** @internal */
  maxBsonMessageSize: number;
  /** @internal */
  [kBuffer]: BufferPool;
  /** @internal */
  isMonitoringConnection = false;

  constructor(options: MessageStreamOptions = {}) {
    super(options);
    this.maxBsonMessageSize = options.maxBsonMessageSize || kDefaultMaxBsonMessageSize;
    this[kBuffer] = new BufferPool();
  }

  get buffer(): BufferPool {
    return this[kBuffer];
  }

  override _write(chunk: Buffer, _: unknown, callback: Callback<Buffer>): void {
    this[kBuffer].append(chunk);
    processIncomingData(this, callback);
  }

  override _read(/* size */): void {
    // NOTE: This implementation is empty because we explicitly push data to be read
    //       when `writeMessage` is called.
    return;
  }

  writeCommand(
    command: WriteProtocolMessageType,
    operationDescription: OperationDescription
  ): void {
    const agreedCompressor = operationDescription.agreedCompressor ?? 'none';
    if (agreedCompressor === 'none' || !OpCompressedRequest.canCompress(command)) {
      const data = command.toBin();
      this.push(Array.isArray(data) ? Buffer.concat(data) : data);
      return;
    }
    // otherwise, compress the message
    const concatenatedOriginalCommandBuffer = Buffer.concat(command.toBin());
    const messageToBeCompressed = concatenatedOriginalCommandBuffer.slice(MESSAGE_HEADER_SIZE);

    // Extract information needed for OP_COMPRESSED from the uncompressed message
    const originalCommandOpCode = concatenatedOriginalCommandBuffer.readInt32LE(12);

    const options = {
      agreedCompressor,
      zlibCompressionLevel: operationDescription.zlibCompressionLevel ?? 0
    };
    // Compress the message body
    compress(options, messageToBeCompressed).then(
      compressedMessage => {
        // Create the msgHeader of OP_COMPRESSED
        const msgHeader = Buffer.alloc(MESSAGE_HEADER_SIZE);
        msgHeader.writeInt32LE(
          MESSAGE_HEADER_SIZE + COMPRESSION_DETAILS_SIZE + compressedMessage.length,
          0
        ); // messageLength
        msgHeader.writeInt32LE(command.requestId, 4); // requestID
        msgHeader.writeInt32LE(0, 8); // responseTo (zero)
        msgHeader.writeInt32LE(OP_COMPRESSED, 12); // opCode

        // Create the compression details of OP_COMPRESSED
        const compressionDetails = Buffer.alloc(COMPRESSION_DETAILS_SIZE);
        compressionDetails.writeInt32LE(originalCommandOpCode, 0); // originalOpcode
        compressionDetails.writeInt32LE(messageToBeCompressed.length, 4); // Size of the uncompressed compressedMessage, excluding the MsgHeader
        compressionDetails.writeUInt8(Compressor[agreedCompressor], 8); // compressorID
        this.push(Buffer.concat([msgHeader, compressionDetails, compressedMessage]));
      },
      error => {
        operationDescription.cb(error);
      }
    );
  }
}

function processIncomingData(stream: MessageStream, callback: Callback<Buffer>): void {
  const buffer = stream[kBuffer];
  const sizeOfMessage = buffer.getInt32();

  if (sizeOfMessage == null) {
    return callback();
  }

  if (sizeOfMessage < 0) {
    return callback(new MongoParseError(`Invalid message size: ${sizeOfMessage}`));
  }

  if (sizeOfMessage > stream.maxBsonMessageSize) {
    return callback(
      new MongoParseError(
        `Invalid message size: ${sizeOfMessage}, max allowed: ${stream.maxBsonMessageSize}`
      )
    );
  }

  if (sizeOfMessage > buffer.length) {
    return callback();
  }

  const message = buffer.read(sizeOfMessage);
  const messageHeader: MessageHeader = {
    length: message.readInt32LE(0),
    requestId: message.readInt32LE(4),
    responseTo: message.readInt32LE(8),
    opCode: message.readInt32LE(12)
  };

  const monitorHasAnotherHello = () => {
    if (stream.isMonitoringConnection) {
      // Can we read the next message size?
      const sizeOfMessage = buffer.getInt32();
      if (sizeOfMessage != null && sizeOfMessage <= buffer.length) {
        return true;
      }
    }
    return false;
  };

  let ResponseType = messageHeader.opCode === OP_MSG ? OpMsgResponse : OpQueryResponse;
  if (messageHeader.opCode !== OP_COMPRESSED) {
    const messageBody = message.subarray(MESSAGE_HEADER_SIZE);

    // If we are a monitoring connection message stream and
    // there is more in the buffer that can be read, skip processing since we
    // want the last hello command response that is in the buffer.
    if (monitorHasAnotherHello()) {
      return processIncomingData(stream, callback);
    }

    stream.emit('message', new ResponseType(message, messageHeader, messageBody));

    if (buffer.length >= 4) {
      return processIncomingData(stream, callback);
    }
    return callback();
  }

  messageHeader.fromCompressed = true;
  messageHeader.opCode = message.readInt32LE(MESSAGE_HEADER_SIZE);
  messageHeader.length = message.readInt32LE(MESSAGE_HEADER_SIZE + 4);
  const compressorID = message[MESSAGE_HEADER_SIZE + 8];
  const compressedBuffer = message.slice(MESSAGE_HEADER_SIZE + 9);

  // recalculate based on wrapped opcode
  ResponseType = messageHeader.opCode === OP_MSG ? OpMsgResponse : OpQueryResponse;
  decompress(compressorID, compressedBuffer).then(
    messageBody => {
      if (messageBody.length !== messageHeader.length) {
        return callback(
          new MongoDecompressionError('Message body and message header must be the same length')
        );
      }

      // If we are a monitoring connection message stream and
      // there is more in the buffer that can be read, skip processing since we
      // want the last hello command response that is in the buffer.
      if (monitorHasAnotherHello()) {
        return processIncomingData(stream, callback);
      }
      stream.emit('message', new ResponseType(message, messageHeader, messageBody));

      if (buffer.length >= 4) {
        return processIncomingData(stream, callback);
      }
      return callback();
    },
    error => {
      return callback(error);
    }
  );
}
