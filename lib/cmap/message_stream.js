"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageStream = void 0;
const stream_1 = require("stream");
const error_1 = require("../error");
const utils_1 = require("../utils");
const commands_1 = require("./commands");
const compression_1 = require("./wire_protocol/compression");
const constants_1 = require("./wire_protocol/constants");
const MESSAGE_HEADER_SIZE = 16;
const COMPRESSION_DETAILS_SIZE = 9; // originalOpcode + uncompressedSize, compressorID
const kDefaultMaxBsonMessageSize = 1024 * 1024 * 16 * 4;
/** @internal */
const kBuffer = Symbol('buffer');
/**
 * A duplex stream that is capable of reading and writing raw wire protocol messages, with
 * support for optional compression
 * @internal
 */
class MessageStream extends stream_1.Duplex {
    constructor(options = {}) {
        super(options);
        this.maxBsonMessageSize = options.maxBsonMessageSize || kDefaultMaxBsonMessageSize;
        this[kBuffer] = new utils_1.BufferPool();
    }
    _write(chunk, _, callback) {
        this[kBuffer].append(chunk);
        processIncomingData(this, callback);
    }
    _read( /* size */) {
        // NOTE: This implementation is empty because we explicitly push data to be read
        //       when `writeMessage` is called.
        return;
    }
    writeCommand(command, operationDescription) {
        // TODO: agreed compressor should live in `StreamDescription`
        const compressorName = operationDescription && operationDescription.agreedCompressor
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
        (0, compression_1.compress)({ options: operationDescription }, messageToBeCompressed, (err, compressedMessage) => {
            if (err || !compressedMessage) {
                operationDescription.cb(err);
                return;
            }
            // Create the msgHeader of OP_COMPRESSED
            const msgHeader = Buffer.alloc(MESSAGE_HEADER_SIZE);
            msgHeader.writeInt32LE(MESSAGE_HEADER_SIZE + COMPRESSION_DETAILS_SIZE + compressedMessage.length, 0); // messageLength
            msgHeader.writeInt32LE(command.requestId, 4); // requestID
            msgHeader.writeInt32LE(0, 8); // responseTo (zero)
            msgHeader.writeInt32LE(constants_1.OP_COMPRESSED, 12); // opCode
            // Create the compression details of OP_COMPRESSED
            const compressionDetails = Buffer.alloc(COMPRESSION_DETAILS_SIZE);
            compressionDetails.writeInt32LE(originalCommandOpCode, 0); // originalOpcode
            compressionDetails.writeInt32LE(messageToBeCompressed.length, 4); // Size of the uncompressed compressedMessage, excluding the MsgHeader
            compressionDetails.writeUInt8(compression_1.Compressor[compressorName], 8); // compressorID
            this.push(Buffer.concat([msgHeader, compressionDetails, compressedMessage]));
        });
    }
}
exports.MessageStream = MessageStream;
// Return whether a command contains an uncompressible command term
// Will return true if command contains no uncompressible command terms
function canCompress(command) {
    const commandDoc = command instanceof commands_1.Msg ? command.command : command.query;
    const commandName = Object.keys(commandDoc)[0];
    return !compression_1.uncompressibleCommands.has(commandName);
}
function processIncomingData(stream, callback) {
    const buffer = stream[kBuffer];
    if (buffer.length < 4) {
        callback();
        return;
    }
    const sizeOfMessage = buffer.peek(4).readInt32LE();
    if (sizeOfMessage < 0) {
        callback(new error_1.MongoParseError(`Invalid message size: ${sizeOfMessage}`));
        return;
    }
    if (sizeOfMessage > stream.maxBsonMessageSize) {
        callback(new error_1.MongoParseError(`Invalid message size: ${sizeOfMessage}, max allowed: ${stream.maxBsonMessageSize}`));
        return;
    }
    if (sizeOfMessage > buffer.length) {
        callback();
        return;
    }
    const message = buffer.read(sizeOfMessage);
    const messageHeader = {
        length: message.readInt32LE(0),
        requestId: message.readInt32LE(4),
        responseTo: message.readInt32LE(8),
        opCode: message.readInt32LE(12)
    };
    let ResponseType = messageHeader.opCode === constants_1.OP_MSG ? commands_1.BinMsg : commands_1.Response;
    if (messageHeader.opCode !== constants_1.OP_COMPRESSED) {
        const messageBody = message.slice(MESSAGE_HEADER_SIZE);
        stream.emit('message', new ResponseType(message, messageHeader, messageBody));
        if (buffer.length >= 4) {
            processIncomingData(stream, callback);
        }
        else {
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
    ResponseType = messageHeader.opCode === constants_1.OP_MSG ? commands_1.BinMsg : commands_1.Response;
    (0, compression_1.decompress)(compressorID, compressedBuffer, (err, messageBody) => {
        if (err || !messageBody) {
            callback(err);
            return;
        }
        if (messageBody.length !== messageHeader.length) {
            callback(new error_1.MongoDecompressionError('Message body and message header must be the same length'));
            return;
        }
        stream.emit('message', new ResponseType(message, messageHeader, messageBody));
        if (buffer.length >= 4) {
            processIncomingData(stream, callback);
        }
        else {
            callback();
        }
    });
}
//# sourceMappingURL=message_stream.js.map