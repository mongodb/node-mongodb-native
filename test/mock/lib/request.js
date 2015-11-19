var Long = require('bson').Long;

/*
 * Request class
 */
var Request = function(server, connection, response) {
  this.server = server;
  this.connection = connection;
  this.response = response;
  this.bson = server.bson;
}

Request.prototype.receive = function() {
  return new Promise(function(resolve, reject) {
    resolve();
  });
}

Request.prototype.reply = function(documents, options) {
  options = options || {};
  documents = Array.isArray(documents) ? documents : [documents];

  // Unpack any variables we need
  var cursorId = options.cursorId || Long.ZERO;
  var responseFlags = typeof options.responseFlags == 'number' ? options.responseFlags : 0;
  var startingFrom = typeof options.startingFrom == 'number' ? options.startingFrom : 0;
  var numberReturned = documents.length;

  // Additional response Options
  var killConnectionAfterNBytes = typeof options.killConnectionAfterNBytes == 'number'
    ? options.killConnectionAfterNBytes : null;

  // Create the Response document
  var response = new Response(this.bson, documents, {
    // Header field
    responseTo: this.response.requestId,
    requestId: this.response.requestId + 1,

    // The OP_REPLY message field
    cursorId: cursorId,
    responseFlags: responseFlags,
    startingFrom: startingFrom,
    numberReturned: numberReturned
  });

  // Get the buffers
  var buffer = response.toBin();
  console.log(buffer.toString('hex'))

  // Do we kill connection after n bytes
  if(killConnectionAfterNBytes == null) {
    this.connection.write(buffer);
  } else {
    // Fail to send whole reply
    if(killConnectionAfterNBytes <= buffer.length) {
      this.connection.write(buffer.slice(0, killConnectionAfterNBytes));
      this.connection.destroy();
    }
  }
}

Object.defineProperty(Request.prototype, 'type', {
  get: function() {
    return this.response.type;
  }
});

Object.defineProperty(Request.prototype, 'document', {
  get: function() {
    return this.response.documents[0];
  }
});

var Response = function(bson, documents, options) {
  this.bson = bson;
  // Header
  this.requestId = options.requestId;
  this.responseTo = options.responseTo;
  this.opCode = 1;

  // Message fields
  this.cursorId = options.cursorId,
  this.responseFlags = options.responseFlags,
  this.startingFrom = options.startingFrom,
  this.numberReturned = options.numberReturned

  // Store documents
  this.documents = documents;
}

Response.prototype.toBin = function() {
  var self = this;
  var buffers = [];

  // Serialize all the docs
  var docs = this.documents.map(function(x) {
    return self.bson.serialize(x);
  });

  // Document total size
  var docsSize = 0;
  docs.forEach(function(x) {
    docsSize = docsSize + x.length;
  });

  // Calculate total size
  var totalSize = 4 + 4 + 4 + 4 // Header size
    + 4 + 8 + 4 + 4             // OP_REPLY Header size
    + docsSize;                 // OP_REPLY Documents

  // Header and op_reply fields
  var header = new Buffer(4 + 4 + 4 + 4 + 4 + 8 + 4 + 4);

  // Write total size
  writeInt32(header, 0, totalSize);
  // Write requestId
  writeInt32(header, 4, this.requestId);
  // Write responseId
  writeInt32(header, 8, this.responseTo);
  // Write opcode
  writeInt32(header, 12, this.opCode);
  // Write responseflags
  writeInt32(header, 16, this.responseFlags);
  // Write cursorId
  writeInt64(header, 20, this.cursorId);
  // Write startingFrom
  writeInt32(header, 28, this.startingFrom);
  // Write startingFrom
  writeInt32(header, 32, this.numberReturned);

  // Add header to the list of buffers
  buffers.push(header);
  // Add docs to list of buffers
  buffers = buffers.concat(docs);
  // Return all the buffers
  return Buffer.concat(buffers);
}

var writeInt32 = function(buffer, index, value) {
  buffer[index] = value & 0xff;
  buffer[index + 1] = (value >> 8) & 0xff;
  buffer[index + 2] = (value >> 16) & 0xff;
  buffer[index + 3] = (value >> 24) & 0xff;
  return;
}

var writeInt64 = function(buffer, index, value) {
  var lowBits = value.getLowBits();
  var highBits = value.getHighBits();
  // Encode low bits
  buffer[index] = lowBits & 0xff;
  buffer[index + 1] = (lowBits >> 8) & 0xff;
  buffer[index + 2] = (lowBits >> 16) & 0xff;
  buffer[index + 3] = (lowBits >> 24) & 0xff;
  // Encode high bits
  buffer[index + 4] = highBits & 0xff;
  buffer[index + 5] = (highBits >> 8) & 0xff;
  buffer[index + 6] = (highBits >> 16) & 0xff;
  buffer[index + 7] = (highBits >> 24) & 0xff;
  return;
}

module.exports = Request;
