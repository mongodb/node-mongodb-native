const BufferList = require('bl');
import { Duplex } from 'stream';
import { Response, Msg, BinMsg } from './commands';
import { MongoError, MongoParseError } from '../error';
import { OP_COMPRESSED, OP_MSG } from './wire_protocol/constants';
import {
  compress,
  decompress,
  compressorIDs,
  uncompressibleCommands
} from './wire_protocol/compression';

const MESSAGE_HEADER_SIZE = 16;
const COMPRESSION_DETAILS_SIZE = 9; // originalOpcode + uncompressedSize, compressorID

const kDefaultMaxBsonMessageSize = 1024 * 1024 * 16 * 4;
const kBuffer = Symbol('buffer');

/**
 * A duplex stream that is capable of reading and writing raw wire protocol messages, with
 * support for optional compression
 */
class MessageStream extends Duplex {
  maxBsonMessageSize: any;
  [kBuffer]: any;

  constructor(options: any) {
    options = options || {};
    super(options);

    this.maxBsonMessageSize = options.maxBsonMessageSize || kDefaultMaxBsonMessageSize;

    this[kBuffer] = new BufferList();
  }

  _write(chunk: any, _: any, callback: Function) {
    const buffer = this[kBuffer];
    buffer.append(chunk);

    processIncomingData(this, callback);
  }

  _read(/* size */) {
    // NOTE: This implementation is empty because we explicitly push data to be read
    //       when `writeMessage` is called.
    return;
  }

  writeCommand(command: any, operationDescription: any) {
    // TODO: agreed compressor should live in `StreamDescription`
    const shouldCompress = operationDescription && !!operationDescription.agreedCompressor;
    if (!shouldCompress || !canCompress(command)) {
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
    compress(
      { options: operationDescription },
      messageToBeCompressed,
      (err?: any, compressedMessage?: any) => {
        if (err) {
          operationDescription.cb(err, null);
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
        compressionDetails.writeUInt8(compressorIDs[operationDescription.agreedCompressor], 8); // compressorID
        this.push(Buffer.concat([msgHeader, compressionDetails, compressedMessage]));
      }
    );
  }
}

// Return whether a command contains an uncompressible command term
// Will return true if command contains no uncompressible command terms
function canCompress(command: any) {
  const commandDoc = command instanceof Msg ? command.command : command.query;
  const commandName = Object.keys(commandDoc)[0];
  return !uncompressibleCommands.has(commandName);
}

function processIncomingData(stream: any, callback: Function) {
  const buffer = stream[kBuffer];
  if (buffer.length < 4) {
    callback();
    return;
  }

  const sizeOfMessage = buffer.readInt32LE(0);
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

  const message = buffer.slice(0, sizeOfMessage);
  buffer.consume(sizeOfMessage);

  const messageHeader = {
    length: message.readInt32LE(0),
    requestId: message.readInt32LE(4),
    responseTo: message.readInt32LE(8),
    opCode: message.readInt32LE(12)
  } as any;

  let ResponseType = messageHeader.opCode === OP_MSG ? BinMsg : Response;
  const responseOptions = stream.responseOptions;
  if (messageHeader.opCode !== OP_COMPRESSED) {
    const messageBody = message.slice(MESSAGE_HEADER_SIZE);
    stream.emit('message', new ResponseType(message, messageHeader, messageBody, responseOptions));

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
  const compressorID = message[MESSAGE_HEADER_SIZE + 8];
  const compressedBuffer = message.slice(MESSAGE_HEADER_SIZE + 9);

  // recalculate based on wrapped opcode
  ResponseType = messageHeader.opCode === OP_MSG ? BinMsg : Response;
  decompress(compressorID, compressedBuffer, (err?: any, messageBody?: any) => {
    if (err) {
      callback(err);
      return;
    }

    if (messageBody.length !== messageHeader.length) {
      callback(
        new MongoError(
          'Decompressing a compressed message from the server failed. The message is corrupt.'
        )
      );

      return;
    }

    stream.emit('message', new ResponseType(message, messageHeader, messageBody, responseOptions));

    if (buffer.length >= 4) {
      processIncomingData(stream, callback);
    } else {
      callback();
    }
  });
}

export = MessageStream;
