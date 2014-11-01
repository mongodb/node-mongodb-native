var f = require('util').format
  , Long = require('bson').Long
  , setProperty = require('./utils').setProperty
  , getProperty = require('./utils').getProperty
  , getSingleProperty = require('./utils').getSingleProperty;

// Incrementing request id
var _requestId = 0;

// Wire command operation ids
var OP_QUERY = 2004;
var OP_GETMORE = 2005;
var OP_KILL_CURSORS = 2007;

// Query flags
var OPTS_NONE = 0;
var OPTS_TAILABLE_CURSOR = 2;
var OPTS_SLAVE = 4;
var OPTS_OPLOG_REPLAY = 8;
var OPTS_NO_CURSOR_TIMEOUT = 16;
var OPTS_AWAIT_DATA = 32;
var OPTS_EXHAUST = 64;
var OPTS_PARTIAL = 128;

// Response flags
var CURSOR_NOT_FOUND = 0;
var QUERY_FAILURE = 2;
var SHARD_CONFIG_STALE = 4;
var AWAIT_CAPABLE = 8;

// Globally shared buffer
var _buffer = null;

//
// Query message
var Query = function(bson, ns, query, options) {
  var self = this;
  // Basic options needed to be passed in
  if(ns == null) throw new Error("ns must be specified for query");
  if(query == null) throw new Error("query must be specified for query");

  // Validate that we are not passing 0x00 in the colletion name
  if(!!~ns.indexOf("\x00")) {
    throw new Error("namespace cannot contain a null character");
  }

  // Save the passed params
  this.bson = bson;
  this.ns = ns;
  this.query = query;

  // Ensure empty options
  this.options = options || {};

  // Additional options
  this.numberToSkip = options.numberToSkip || 0;
  this.numberToReturn = options.numberToReturn || 0;
  this.returnFieldSelector = options.returnFieldSelector || null;  
  this.requestId = _requestId++;

  // Serialization option
  this.serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  this.maxBsonSize = options.maxBsonSize || 1024 * 1024 * 16;
  this.checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : true;

  // Properties
  this.tailable = {name: 'tailable', value: 0};
  this.slave = {name: 'slaveOk', value: 0};
  this.oplogReply = {name: 'oplogReply', value: 0};
  this.noCursorTimeout = {name: 'noCursorTimeout', value: 0};
  this.awaitData = {name: 'awaitData', value: 0};
  this.exhaust = {name: 'exhaust', value: 0};
  this.partial = {name: 'partial', value: 0};

  // Set the flags
  this.values = {
    flags: 0
  }
  
  // Allow the manipulation of the batch size of the cursor
  // after creation has happened
  Object.defineProperty(this, 'batchSize', {
      enumerable:true,
      set: function(value) { self.numberToReturn = value; }
    , get: function() { return self.numberToReturn; }
  });  

  // Setup properties
  setProperty(this, this.tailable, OPTS_TAILABLE_CURSOR, this.values);
  setProperty(this, this.slave, OPTS_SLAVE, this.values);
  setProperty(this, this.oplogReply, OPTS_OPLOG_REPLAY, this.values);
  setProperty(this, this.noCursorTimeout, OPTS_NO_CURSOR_TIMEOUT, this.values);
  setProperty(this, this.awaitData, OPTS_AWAIT_DATA, this.values);
  setProperty(this, this.exhaust, OPTS_EXHAUST, this.values);
  setProperty(this, this.partial, OPTS_PARTIAL, this.values);

  // // Get the request Id
  // Object.defineProperty(this, 'requestId', {
  //     enumerable:true
  //   , get: function() { return self.requestId; }
  // });
}

//
// Assign a new request Id
Query.prototype.incRequestId = function() {
  this.requestId = _requestId++;
}

//
// Uses a single allocated buffer for the process, avoiding multiple memory allocations
Query.prototype.toBinUnified = function() {
  var self = this;
  // No global buffer yet
  if(_buffer == null) _buffer = new Buffer(self.maxBsonSize + (16 * 1024));

  // Initial index
  var index = 4;

  // Write header information
  index = write32bit(index, _buffer, self.requestId);
  index = write32bit(index, _buffer, 0);
  index = write32bit(index, _buffer, OP_QUERY);
  index = write32bit(index, _buffer, self.values.flags);

  // Write collection name
  index = index + _buffer.write(self.ns, index, 'utf8') + 1;
  _buffer[index - 1] = 0;

  // Write rest of fields
  index = write32bit(index, _buffer, self.numberToSkip);
  index = write32bit(index, _buffer, self.numberToReturn);

  // Serialize query
  var queryLength = self.bson.serializeWithBufferAndIndex(self.query
    , self.checkKeys
    , _buffer, index
    , self.serializeFunctions) - index + 1;

  // Write document into buffer
  index = write32bit(index, _buffer, queryLength);
  index = index - 4 + queryLength;
  _buffer[index + 1] = 0x00;
  
  // If we have field selectors
  if(self.returnFieldSelector && Object.keys(self.returnFieldSelector).length > 0) {
    var fieldSelectorLength = self.bson.serializeWithBufferAndIndex(self.returnFieldSelector
      , self.checkKeys
      , _buffer
      , index
      , self.serializeFunctions) - index + 1;
    index = write32bit(index, _buffer, fieldSelectorLength);
    index = index - 4 + fieldSelectorLength;
    _buffer[index + 1] = 0x00;
  }

  // Write total document length
  write32bit(0, _buffer, index);
  // Allocate a new buffer
  var finalBuffer = new Buffer(index);
  _buffer.copy(finalBuffer, 0, 0, index);
  // Return buffer
  return finalBuffer;
}

// To Binary
Query.prototype.toBin = function() {
  var self = this;
  // Basic length
  var length = 4 
    + Buffer.byteLength(self.ns) 
    + 1 + 4 + 4 
    + self.bson.calculateObjectSize(self.query, self.serializeFunctions, true) 
    + (4 * 4);

  // Additional size for field selection
  if(self.returnFieldSelector && Object.keys(self.returnFieldSelector).length > 0) {
    length += self.bson.calculateObjectSize(self.returnFieldSelector, self.serializeFunctions, true);
  }

  // Validate BSON size
  if(length > self.maxBsonSize) {
    throw new Error(f("command exceeds maximum bson size [%s > %s]", self.maxBsonSize, length));
  }

  // Create command buffer
  var buffer = new Buffer(length);
  var index = 0;
  
  // Write header information
  index = write32bit(index, buffer, length);
  index = write32bit(index, buffer, self.requestId);
  index = write32bit(index, buffer, 0);
  index = write32bit(index, buffer, OP_QUERY);
  index = write32bit(index, buffer, self.values.flags);
  // Write collection name
  index = index + buffer.write(self.ns, index, 'utf8') + 1;
  buffer[index - 1] = 0;

  // Write rest of fields
  index = write32bit(index, buffer, self.numberToSkip);
  index = write32bit(index, buffer, self.numberToReturn);

  // Serialize query
  var queryLength = self.bson.serializeWithBufferAndIndex(self.query
    , self.checkKeys
    , buffer, index
    , self.serializeFunctions) - index + 1;

  // Write document into buffer
  index = write32bit(index, buffer, queryLength);
  index = index - 4 + queryLength;
  buffer[index + 1] = 0x00;
  
  // If we have field selectors
  if(self.returnFieldSelector && Object.keys(self.returnFieldSelector).length > 0) {
    var fieldSelectorLength = self.bson.serializeWithBufferAndIndex(self.returnFieldSelector
      , self.checkKeys
      , buffer
      , index
      , self.serializeFunctions) - index + 1;
    index = write32bit(index, buffer, fieldSelectorLength);
    index = index - 4 + fieldSelectorLength;
    buffer[index + 1] = 0x00;
  }

  // Return buffer
  return buffer;
}

Query.getRequestId = function() {
  return ++_requestId;
}

var GetMore = function(bson, ns, cursorId, opts) {
  opts = opts || {};
  var numberToReturn = opts.numberToReturn || 0;
  var requestId = _requestId++;

  // Get the request Id
  Object.defineProperty(this, 'requestId', {
      enumerable:true
    , get: function() { return requestId; }
  });

  //
  // Uses a single allocated buffer for the process, avoiding multiple memory allocations
  this.toBinUnified = function() {
    var length = 4 + Buffer.byteLength(ns) + 1 + 4 + 8 + (4 * 4);
    // No global buffer yet
    if(_buffer == null) _buffer = new Buffer(maxBsonSize + (16 * 1024));
    // Create command buffer
    var index = 0;
    
    // Write header information
    index = write32bit(index, _buffer, length);
    index = write32bit(index, _buffer, requestId);
    index = write32bit(index, _buffer, 0);
    index = write32bit(index, _buffer, OP_GETMORE);
    index = write32bit(index, _buffer, 0);

    // Write collection name
    index = index + _buffer.write(ns, index, 'utf8') + 1;
    _buffer[index - 1] = 0;

    // Write batch size
    index = write32bit(index, _buffer, numberToReturn);
    // Write cursor id
    index = write32bit(index, _buffer, cursorId.getLowBits());
    index = write32bit(index, _buffer, cursorId.getHighBits());

    // Allocate a new buffer
    var finalBuffer = new Buffer(index);
    _buffer.copy(finalBuffer, 0, 0, index);

    // Return buffer
    return finalBuffer;
  }

  // To Binary
  this.toBin = function() {
    var length = 4 + Buffer.byteLength(ns) + 1 + 4 + 8 + (4 * 4);
    // Create command buffer
    var buffer = new Buffer(length);
    var index = 0;
    
    // Write header information
    index = write32bit(index, buffer, length);
    index = write32bit(index, buffer, requestId);
    index = write32bit(index, buffer, 0);
    index = write32bit(index, buffer, OP_GETMORE);
    index = write32bit(index, buffer, 0);

    // Write collection name
    index = index + buffer.write(ns, index, 'utf8') + 1;
    buffer[index - 1] = 0;

    // Write batch size
    index = write32bit(index, buffer, numberToReturn);
    // Write cursor id
    index = write32bit(index, buffer, cursorId.getLowBits());
    index = write32bit(index, buffer, cursorId.getHighBits());

    // Return buffer
    return buffer;
  }
}

var KillCursor = function(bson, cursorIds) {
  var requestId = _requestId++;

  // Get the request Id
  Object.defineProperty(this, 'requestId', {
      enumerable:true
    , get: function() { return requestId; }
  });

  //
  // Uses a single allocated buffer for the process, avoiding multiple memory allocations
  this.toBinUnified = function() {
    var length = 4 + 4 + (4 * 4) + (cursorIds.length * 8);

    // No global buffer yet
    if(_buffer == null) _buffer = new Buffer(maxBsonSize + (16 * 1024));
    // Create command buffer
    var index = 0;

    // Write header information
    index = write32bit(index, _buffer, length);
    index = write32bit(index, _buffer, requestId);
    index = write32bit(index, _buffer, 0);
    index = write32bit(index, _buffer, OP_KILL_CURSORS);
    index = write32bit(index, _buffer, 0);

    // Write batch size
    index = write32bit(index, _buffer, cursorIds.length);

    // Write all the cursor ids into the array
    for(var i = 0; i < cursorIds.length; i++) {
      // Write cursor id
      index = write32bit(index, _buffer, cursorIds[i].getLowBits());
      index = write32bit(index, _buffer, cursorIds[i].getHighBits());
    }

    // Allocate a new buffer
    var finalBuffer = new Buffer(index);
    _buffer.copy(finalBuffer, 0, 0, index);

    // Return buffer
    return finalBuffer;
  }

  // Generate binary message
  this.toBin = function() {
    var length = 4 + 4 + (4 * 4) + (cursorIds.length * 8);

    // Create command buffer
    var buffer = new Buffer(length);
    var index = 0;

    // Write header information
    index = write32bit(index, buffer, length);
    index = write32bit(index, buffer, requestId);
    index = write32bit(index, buffer, 0);
    index = write32bit(index, buffer, OP_KILL_CURSORS);
    index = write32bit(index, buffer, 0);

    // Write batch size
    index = write32bit(index, buffer, cursorIds.length);

    // Write all the cursor ids into the array
    for(var i = 0; i < cursorIds.length; i++) {
      // Write cursor id
      index = write32bit(index, buffer, cursorIds[i].getLowBits());
      index = write32bit(index, buffer, cursorIds[i].getHighBits());
    }

    // Return buffer
    return buffer;
  }
}

var Response = function(bson, data, opts) {
  opts = opts || {promoteLongs: true};
  var parsed = false;
  this.values = {
    documents: []
  }

  // Set local values
  this.bson = bson;
  this.data = data;
  this.opts = opts;

  // Set error properties
  getProperty(this, 'cursorNotFound', 'responseFlags', this.values, function(value) {
    return (value & CURSOR_NOT_FOUND) != 0;
  });

  getProperty(this, 'queryFailure', 'responseFlags', this.values, function(value) {
    return (value & QUERY_FAILURE) != 0;
  });

  getProperty(this, 'shardConfigStale', 'responseFlags', this.values, function(value) {
    return (value & SHARD_CONFIG_STALE) != 0;
  });

  getProperty(this, 'awaitCapable', 'responseFlags', this.values, function(value) {
    return (value & AWAIT_CAPABLE) != 0;
  });

  // Set standard properties
  getProperty(this, 'length', 'length', this.values);
  getProperty(this, 'requestId', 'requestId', this.values);
  getProperty(this, 'responseTo', 'responseTo', this.values);
  getProperty(this, 'responseFlags', 'responseFlags', this.values);
  getProperty(this, 'cursorId', 'cursorId', this.values);
  getProperty(this, 'startingFrom', 'startingFrom', this.values);
  getProperty(this, 'numberReturned', 'numberReturned', this.values);
  getProperty(this, 'documents', 'documents', this.values);
  getSingleProperty(this, 'raw', data);

  //
  // Parse Header
  //
  var index = 0;
  // Read the message length
  this.values.length = data.readUInt32LE(index);
  index = index + 4;
  // Fetch the request id for this reply
  this.values.requestId = data.readUInt32LE(index);
  index = index + 4;
  // Fetch the id of the request that triggered the response
  this.values.responseTo = data.readUInt32LE(index);
  // Skip op-code field
  index = index + 4 + 4;
  // Unpack flags
  this.values.responseFlags = data.readUInt32LE(index);
  index = index + 4; 
  // Unpack the cursor
  var lowBits = data.readUInt32LE(index);
  index = index + 4; 
  var highBits = data.readUInt32LE(index);
  index = index + 4; 
  // Create long object
  this.values.cursorId = new Long(lowBits, highBits);
  // Unpack the starting from
  this.values.startingFrom = data.readUInt32LE(index);
  index = index + 4; 
  // Unpack the number of objects returned
  this.values.numberReturned = data.readUInt32LE(index);
  index = index + 4; 
  // Set the current index location
  this.index = index;
}

Response.prototype.isParsed = function() {
  return this.parsed;
}

Response.prototype.parse = function(options) {
  // Don't parse again if not needed
  if(this.parsed) return;
  options = options || {};
  // Allow the return of raw documents instead of parsing
  var raw = options.raw || false;

  //
  // Parse Body
  //
  for(var i = 0; i < this.values.numberReturned; i++) {
    var bsonSize = this.data.readUInt32LE(this.index);
    // Parse options
    var _options = {promoteLongs: this.opts.promoteLongs};

    // If we have raw results specified slice the return document
    if(raw) {
      this.values.documents.push(this.data.slice(this.index, this.index + bsonSize));
    } else {
      this.values.documents.push(this.bson.deserialize(this.data.slice(this.index, this.index + bsonSize), _options));
    }

    // Adjust the index
    this.index = this.index + bsonSize;
  }

  // Set parsed
  this.parsed = true;
}

var write32bit = function(index, buffer, value) {
  buffer[index + 3] = (value >> 24) & 0xff;
  buffer[index + 2] = (value >> 16) & 0xff;
  buffer[index + 1] = (value >> 8) & 0xff;
  buffer[index] = (value) & 0xff;
  return index + 4;
}

//
// Redefine write32bit to use buffer method if available
if(new Buffer(0).writeInt32LE) {
  write32bit = function(index, buffer, value) {
    buffer.writeInt32LE(value, index);
    return index + 4;
  }
}

module.exports = {
    Query: Query
  , GetMore: GetMore
  , Response: Response
  , KillCursor: KillCursor
}