'use strict';

const Duplex = require('stream').Duplex;
const BufferList = require('bl');
const MongoParseError = require('../core/error').MongoParseError;
const decompress = require('../core/wireprotocol/compression').decompress;
const Response = require('../core/connection/commands').Response;
const BinMsg = require('../core/connection/msg').BinMsg;
const MongoError = require('../core/error').MongoError;
const OP_COMPRESSED = require('../core/wireprotocol/shared').opcodes.OP_COMPRESSED;
const OP_MSG = require('../core/wireprotocol/shared').opcodes.OP_MSG;
const MESSAGE_HEADER_SIZE = require('../core/wireprotocol/shared').MESSAGE_HEADER_SIZE;
const COMPRESSION_DETAILS_SIZE = require('../core/wireprotocol/shared').COMPRESSION_DETAILS_SIZE;
const opcodes = require('../core/wireprotocol/shared').opcodes;
const compress = require('../core/wireprotocol/compression').compress;
const compressorIDs = require('../core/wireprotocol/compression').compressorIDs;
const uncompressibleCommands = require('../core/wireprotocol/compression').uncompressibleCommands;
const Msg = require('../core/connection/msg').Msg;

const kDefaultMaxBsonMessageSize = 1024 * 1024 * 16 * 4;
const kBuffer = Symbol('buffer');

/**
 * A duplex stream that is capable of reading and writing raw wire protocol messages, with
 * support for optional compression
 */
class MessageStream extends Duplex {
  constructor(options) {
    options = options || {};
    super(options);

    this.bson = options.bson;
    this.maxBsonMessageSize = options.maxBsonMessageSize || kDefaultMaxBsonMessageSize;

    this[kBuffer] = new BufferList();
  }

  _write(chunk, _, callback) {
    const buffer = this[kBuffer];
    buffer.append(chunk);

    while (buffer.length >= 4) {
      const sizeOfMessage = buffer.readInt32LE(0);
      if (sizeOfMessage < 0) {
        callback(new MongoParseError(`Invalid message size: ${sizeOfMessage}`));
        return;
      }

      if (sizeOfMessage > this.maxBsonMessageSize) {
        callback(
          new MongoParseError(
            `Invalid message size: ${sizeOfMessage}, max allowed: ${this.maxBsonMessageSize}`
          )
        );
        return;
      }

      if (sizeOfMessage > buffer.length) {
        callback();
        return;
      }

      const messageBuffer = buffer.slice(0, sizeOfMessage);
      buffer.consume(sizeOfMessage);

      processMessage(this, messageBuffer, callback);
    }
  }

  _read(/* size */) {
    // NOTE: This implementation is empty because we explicitly push data to be read
    //       when `writeMessage` is called.
    return;
  }

  writeCommand(command, operationDescription) {
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
    compress({ options: operationDescription }, messageToBeCompressed, (err, compressedMessage) => {
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
      msgHeader.writeInt32LE(opcodes.OP_COMPRESSED, 12); // opCode

      // Create the compression details of OP_COMPRESSED
      const compressionDetails = Buffer.alloc(COMPRESSION_DETAILS_SIZE);
      compressionDetails.writeInt32LE(originalCommandOpCode, 0); // originalOpcode
      compressionDetails.writeInt32LE(messageToBeCompressed.length, 4); // Size of the uncompressed compressedMessage, excluding the MsgHeader
      compressionDetails.writeUInt8(compressorIDs[operationDescription.agreedCompressor], 8); // compressorID

      this.push(Buffer.concat([msgHeader, compressionDetails, compressedMessage]));
    });
  }
}

// Return whether a command contains an uncompressible command term
// Will return true if command contains no uncompressible command terms
function canCompress(command) {
  const commandDoc = command instanceof Msg ? command.command : command.query;
  const commandName = Object.keys(commandDoc)[0];
  return !uncompressibleCommands.has(commandName);
}

function processMessage(stream, message, callback) {
  const messageHeader = {
    length: message.readInt32LE(0),
    requestId: message.readInt32LE(4),
    responseTo: message.readInt32LE(8),
    opCode: message.readInt32LE(12)
  };

  let ResponseType = messageHeader.opCode === OP_MSG ? BinMsg : Response;
  const responseOptions = stream.responseOptions;
  if (messageHeader.opCode !== OP_COMPRESSED) {
    const messageBody = message.slice(MESSAGE_HEADER_SIZE);
    stream.emit(
      'message',
      new ResponseType(stream.bson, message, messageHeader, messageBody, responseOptions)
    );

    callback();
    return;
  }

  messageHeader.fromCompressed = true;
  messageHeader.opCode = message.readInt32LE(MESSAGE_HEADER_SIZE);
  messageHeader.length = message.readInt32LE(MESSAGE_HEADER_SIZE + 4);
  const compressorID = message[MESSAGE_HEADER_SIZE + 8];
  const compressedBuffer = message.slice(MESSAGE_HEADER_SIZE + 9);

  // recalculate based on wrapped opcode
  ResponseType = messageHeader.opCode === OP_MSG ? BinMsg : Response;

  decompress(compressorID, compressedBuffer, (err, messageBody) => {
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

    stream.emit(
      'message',
      new ResponseType(stream.bson, message, messageHeader, messageBody, responseOptions)
    );

    callback();
  });
}

module.exports = MessageStream;
