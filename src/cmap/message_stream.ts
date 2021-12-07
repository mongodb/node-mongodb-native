import { Duplex, DuplexOptions } from 'stream';

import type { BSONSerializeOptions, Document } from '../bson';
import { MongoDecompressionError, MongoParseError } from '../error';
import type { ClientSession } from '../sessions';
import { BufferPool, Callback } from '../utils';
import { BinMsg, MessageHeader, Msg, Query, Response, WriteProtocolMessageType } from './commands';
import {
  compress,
  Compressor,
  CompressorName,
  decompress,
  uncompressibleCommands
} from './wire_protocol/compression';
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
  command: boolean;
  documentsReturnedIn?: string;
  fullResult: boolean;
  noResponse: boolean;
  raw: boolean;
  requestId: number;
  session?: ClientSession;
  socketTimeoutOverride?: boolean;
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

  constructor(options: MessageStreamOptions = {}) {
    super(options);
    this.maxBsonMessageSize = options.maxBsonMessageSize || kDefaultMaxBsonMessageSize;
    this[kBuffer] = new BufferPool();
  }

  _write(chunk: Buffer, _: unknown, callback: Callback<Buffer>): void {
    this[kBuffer].append(chunk);
    processIncomingData(this, callback);
  }

  _read(/* size */): void {
    // NOTE: This implementation is empty because we explicitly push data to be read
    //       when `writeMessage` is called.
    return;
  }

  writeCommand(
    command: WriteProtocolMessageType,
    operationDescription: OperationDescription
  ): void {
    // TODO: agreed compressor should live in `StreamDescription`
    const compressorName: CompressorName =
      operationDescription && operationDescription.agreedCompressor
        ? operationDescription.agreedCompressor
        : 'none';
    if (compressorName === 'none' || !canCompress(command)) {
      const data = command.toBin();
      this.push(Array.isArray(data) ? Buffer.concat(data) : data);
      return;
    }
    // otherwise, compress the message
    const concatenatedOriginalCommandBuffer = Buffer.concat(command.toBin());
    const messageToBeCompressed = concatenatedOriginalCommandBuffer.slice(MESSAGE_HEADER_SIZE);

    // Extract information needed for OP_COMPRESSED from the uncompressed message
    const originalCommandOpCode = concatenatedOriginalCommandBuffer.readInt32LE(12);

    // Compress the message body
    compress({ options: operationDescription }, messageToBeCompressed, (err, compressedMessage) => {
      if (err || !compressedMessage) {
        operationDescription.cb(err);
        return;
      }

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
      compressionDetails.writeUInt8(Compressor[compressorName], 8); // compressorID
      this.push(Buffer.concat([msgHeader, compressionDetails, compressedMessage]));
    });
  }
}

// Return whether a command contains an uncompressible command term
// Will return true if command contains no uncompressible command terms
function canCompress(command: WriteProtocolMessageType) {
  const commandDoc = command instanceof Msg ? command.command : (command as Query).query;
  const commandName = Object.keys(commandDoc)[0];
  return !uncompressibleCommands.has(commandName);
}

function processIncomingData(stream: MessageStream, callback: Callback<Buffer>) {
  const buffer = stream[kBuffer];
  if (buffer.length < 4) {
    callback();
    return;
  }

  const sizeOfMessage = buffer.peek(4).readInt32LE();
  if (sizeOfMessage < 0) {
    callback(new MongoParseError(`Invalid message size: ${sizeOfMessage}`));
    return;
  }

  if (sizeOfMessage > stream.maxBsonMessageSize) {
    callback(
      new MongoParseError(
        `Invalid message size: ${sizeOfMessage}, max allowed: ${stream.maxBsonMessageSize}`
      )
    );
    return;
  }

  if (sizeOfMessage > buffer.length) {
    callback();
    return;
  }

  const message = buffer.read(sizeOfMessage);
  const messageHeader: MessageHeader = {
    length: message.readInt32LE(0),
    requestId: message.readInt32LE(4),
    responseTo: message.readInt32LE(8),
    opCode: message.readInt32LE(12)
  };

  let ResponseType = messageHeader.opCode === OP_MSG ? BinMsg : Response;
  if (messageHeader.opCode !== OP_COMPRESSED) {
    const messageBody = message.slice(MESSAGE_HEADER_SIZE);
    stream.emit('message', new ResponseType(message, messageHeader, messageBody));

    if (buffer.length >= 4) {
      processIncomingData(stream, callback);
    } else {
      callback();
    }

    return;
  }

  messageHeader.fromCompressed = true;
  messageHeader.opCode = message.readInt32LE(MESSAGE_HEADER_SIZE);
  messageHeader.length = message.readInt32LE(MESSAGE_HEADER_SIZE + 4);
  const compressorID: Compressor = message[MESSAGE_HEADER_SIZE + 8] as Compressor;
  const compressedBuffer = message.slice(MESSAGE_HEADER_SIZE + 9);

  // recalculate based on wrapped opcode
  ResponseType = messageHeader.opCode === OP_MSG ? BinMsg : Response;
  decompress(compressorID, compressedBuffer, (err, messageBody) => {
    if (err || !messageBody) {
      callback(err);
      return;
    }

    if (messageBody.length !== messageHeader.length) {
      callback(
        new MongoDecompressionError('Message body and message header must be the same length')
      );

      return;
    }

    stream.emit('message', new ResponseType(message, messageHeader, messageBody));

    if (buffer.length >= 4) {
      processIncomingData(stream, callback);
    } else {
      callback();
    }
  });
}
