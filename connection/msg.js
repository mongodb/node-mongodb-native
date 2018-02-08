'use strict';

// Implementation of OP_MSG spec:
// https://github.com/mongodb/specifications/blob/master/source/message/OP_MSG.rst
//
// struct Section {
//   uint8 payloadType;
//   union payload {
//       document  document; // payloadType == 0
//       struct sequence { // payloadType == 1
//           int32      size;
//           cstring    identifier;
//           document*  documents;
//       };
//   };
// };

// struct OP_MSG {
//   struct MsgHeader {
//       int32  messageLength;
//       int32  requestID;
//       int32  responseTo;
//       int32  opCode = 2013;
//   };
//   uint32      flagBits;
//   Section+    sections;
//   [uint32     checksum;]
// };

const opcodes = require('../wireprotocol/shared').opcodes;

// Incrementing request id
let _requestId = 0;

// Msg Flags
const OPTS_CHECKSUM_PRESENT = 1;
const OPTS_MORE_TO_COME = 2;
const OPTS_EXHAUST_ALLOWED = 1 >> 16;

class Msg {
  constructor(bson, query, options) {
    // Basic options needed to be passed in
    if (query == null) throw new Error('query must be specified for query');

    // Basic options
    this.bson = bson;
    this.query = Array.isArray(query) ? query : [query];

    // Ensure empty options
    this.options = options || {};

    // Additional options
    this.requestId = Msg.getRequestId();

    // Serialization option
    this.serializeFunctions =
      typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
    this.ignoreUndefined =
      typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;
    this.checkKeys = typeof options.checkKeys === 'boolean' ? options.checkKeys : false;
    this.maxBsonSize = options.maxBsonSize || 1024 * 1024 * 16;

    // flags
    this.checksumPresent = false;
    this.moreToCome = options.moreToCome || false;
    this.exhaustAllowed = false;
  }

  toBin() {
    const buffers = [];
    let flags = 0;

    if (this.checksumPresent) {
      flags |= OPTS_CHECKSUM_PRESENT;
    }

    if (this.moreToCome) {
      flags |= OPTS_MORE_TO_COME;
    }

    if (this.exhaustAllowed) {
      flags |= OPTS_EXHAUST_ALLOWED;
    }

    const header = new Buffer(
      4 * 4 + // Header
        4 // Flags
    );

    buffers.push(header);

    let totalLength = header.length;

    for (let i = 0; i < this.query.length; ++i) {
      const query = this.query[i];

      const nameArgumentPair = getValidSegmentListNamePairs(query);
      if (nameArgumentPair) {
        // TODO: Add support for payload type 1
        const argument = nameArgumentPair.argument;

        // Add initial type 0 segment with arguments pulled up
        const clonedQuery = Object.assign({}, query);
        delete clonedQuery[argument];
        totalLength += this.makeDocumentSegment(buffers, clonedQuery);

        // Create type 1 query
        totalLength += this.makeSequenceSegment(buffers, argument, query[argument]);
      } else {
        totalLength += this.makeDocumentSegment(buffers, query);
      }
    }

    writeInt32ListToUint8Buffer(header, [totalLength, this.requestId, 0, opcodes.OP_MSG, flags]);

    return buffers;
  }

  makeDocumentSegment(buffers, document) {
    const payloadTypeBuffer = new Buffer(1);
    payloadTypeBuffer[0] = 0;

    const documentBuffer = this.serializeBson(document);

    buffers.push(payloadTypeBuffer);
    buffers.push(documentBuffer);

    return payloadTypeBuffer.length + documentBuffer.length;
  }

  makeSequenceSegment(buffers, argument, documents) {
    const metaBuffer = new Buffer(
      1 + // payloadType,
      4 + // Size of sequence
      argument.length + // Argument length
        1 //C string null terminator
    );

    let segmentLength = metaBuffer.length - 1;

    buffers.push(metaBuffer);
    documents.forEach(document => {
      const documentBuffer = this.serializeBson(document);
      segmentLength += documentBuffer.length;
      buffers.push(documentBuffer);
    });

    metaBuffer[0] = 1 & 0x1;
    metaBuffer[1] = segmentLength & 0xff;
    metaBuffer[2] = (segmentLength >> 8) & 0xff;
    metaBuffer[3] = (segmentLength >> 16) & 0xff;
    metaBuffer[4] = (segmentLength >> 24) & 0xff;
    metaBuffer.write(argument, 5, 'utf8');
    metaBuffer[metaBuffer.length - 1] = 0;

    return segmentLength + 1;
  }

  serializeBson(document) {
    return this.bson.serialize(document, {
      checkKeys: this.checkKeys,
      serializeFunctions: this.serializeFunctions,
      ignoreUndefined: this.ignoreUndefined
    });
  }
}

Msg.getRequestId = function() {
  return ++_requestId;
};

class BinMsg {
  constructor(bson, message, msgHeader, msgBody, opts) {
    opts = opts || { promoteLongs: true, promoteValues: true, promoteBuffers: false };
    this.parsed = false;
    this.raw = message;
    this.data = msgBody;
    this.bson = bson;
    this.opts = opts;

    // Read the message header
    this.length = msgHeader.length;
    this.requestId = msgHeader.requestId;
    this.responseTo = msgHeader.responseTo;
    this.opCode = msgHeader.opCode;

    // Read response flags
    this.responseFlags = msgBody.readInt32LE(0);
    this.checksumPresent = (this.responseFlags & Msg.flags.CHECKSUM_PRESENT) !== 0;
    this.moreToCome = (this.responseFlags & Msg.flags.MORE_TO_COME) !== 0;
    this.exhaustAllowed = (this.responseFlags & Msg.flags.EXHAUST_ALLOWED) !== 0;
    this.promoteLongs = typeof opts.promoteLongs === 'boolean' ? opts.promoteLongs : true;
    this.promoteValues = typeof opts.promoteValues === 'boolean' ? opts.promoteValues : true;
    this.promoteBuffers = typeof opts.promoteBuffers === 'boolean' ? opts.promoteBuffers : false;

    this.documents = [];
  }

  isParsed() {
    return this.parsed;
  }

  parse(options) {
    // Don't parse again if not needed
    if (this.parsed) return;
    options = options || {};

    this.index = 4;
    // Allow the return of raw documents instead of parsing
    const raw = options.raw || false;
    const promoteLongs =
      typeof options.promoteLongs === 'boolean' ? options.promoteLongs : this.opts.promoteLongs;
    const promoteValues =
      typeof options.promoteValues === 'boolean' ? options.promoteValues : this.opts.promoteValues;
    const promoteBuffers =
      typeof options.promoteBuffers === 'boolean'
        ? options.promoteBuffers
        : this.opts.promoteBuffers;

    // Set up the options
    const _options = {
      promoteLongs: promoteLongs,
      promoteValues: promoteValues,
      promoteBuffers: promoteBuffers
    };

    while (this.index < this.data.length) {
      const payloadType = this.data.readUInt8(this.index++);
      if (payloadType === 1) {
        console.error('TYPE 1');
      } else if (payloadType === 0) {
        const bsonSize = this.data.readUInt32LE(this.index);
        const bin = this.data.slice(this.index, this.index + bsonSize);
        this.documents.push(raw ? bin : this.bson.deserialize(bin, _options));

        this.index += bsonSize;
      }
    }

    this.parsed = true;
  }
}

Msg.flags = {
  CHECKSUM_PRESENT: 1,
  MORE_TO_COME: 2,
  EXHAUST_ALLOWED: 1 << 16
};

function writeInt32ListToUint8Buffer(buffer, int32List, start) {
  let index = start || 0;
  int32List.forEach(int32 => {
    buffer[index] = int32 & 0xff;
    buffer[index + 1] = (int32 >> 8) & 0xff;
    buffer[index + 2] = (int32 >> 16) & 0xff;
    buffer[index + 3] = (int32 >> 24) & 0xff;
    index += 4;
  });

  return index;
}

const VALID_NAME_ARGUMENT_MAPS = {
  insert: 'documents',
  update: 'updates',
  delete: 'deletes'
};

function getValidSegmentListNamePairs(query) {
  for (let name in VALID_NAME_ARGUMENT_MAPS) {
    if (name in query) {
      const argument = VALID_NAME_ARGUMENT_MAPS[name];
      if (query[argument] && query[argument].length > 1) {
        return { name, argument };
      }
    }
  }

  return false;
}

module.exports = { Msg, BinMsg };
