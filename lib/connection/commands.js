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

/**************************************************************
 * QUERY
 **************************************************************/
var Query = function(bson, ns, query, options) {
  // Basic options needed to be passed in
  if(ns == null) throw new Error("ns must be specified for query");
  if(query == null) throw new Error("query must be specified for query");

  // Validate that we are not passing 0x00 in the colletion name
  if(!!~ns.indexOf("\x00")) {
    throw new Error("namespace cannot contain a null character");
  }

  // Basic options
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

  // Allow the manipulation of the batch size of the cursor
  // after creation has happened
  Object.defineProperty(this, 'batchSize', {
      enumerable:true,
      set: function(value) { numberToReturn = value; }
    , get: function() { return numberToReturn; }
  });

  // Flags
  this.tailable = false;
  this.slaveOk = false;
  this.oplogReply = false;
  this.noCursorTimeout = false;
  this.awaitData = false;
  this.exhaust = false;
  this.partial = false;
}

//
// Assign a new request Id
Query.prototype.incRequestId = function() {
  this.requestId = _requestId++;
}

//
// Uses a single allocated buffer for the process, avoiding multiple memory allocations
Query.prototype.toBinUnified = function() {
  // No global buffer yet
  if(_buffer == null) _buffer = new Buffer(this.maxBsonSize + (16 * 1024));

  // Set up the flags
  var flags = 0;
  if(this.tailable) flags |= OPTS_TAILABLE_CURSOR;
  if(this.slaveOk) flags |= OPTS_SLAVE;
  if(this.oplogReply) flags |= OPTS_OPLOG_REPLAY;
  if(this.noCursorTimeout) flags |= OPTS_NO_CURSOR_TIMEOUT;
  if(this.awaitData) flags |= OPTS_AWAIT_DATA;
  if(this.exhaust) flags |= OPTS_EXHAUST;
  if(this.partial) flags |= OPTS_PARTIAL;

  // Initial index
  var index = 4;

  // Write header information requestId
  _buffer[index + 3] = (this.requestId >> 24) & 0xff;
  _buffer[index + 2] = (this.requestId >> 16) & 0xff;
  _buffer[index + 1] = (this.requestId >> 8) & 0xff;
  _buffer[index] = (this.requestId) & 0xff;
  index = index + 4;

  // Write header information responseTo
  _buffer[index + 3] = (0 >> 24) & 0xff;
  _buffer[index + 2] = (0 >> 16) & 0xff;
  _buffer[index + 1] = (0 >> 8) & 0xff;
  _buffer[index] = (0) & 0xff;
  index = index + 4;

  // Write header information OP_QUERY
  _buffer[index + 3] = (OP_QUERY >> 24) & 0xff;
  _buffer[index + 2] = (OP_QUERY >> 16) & 0xff;
  _buffer[index + 1] = (OP_QUERY >> 8) & 0xff;
  _buffer[index] = (OP_QUERY) & 0xff;
  index = index + 4;

  // Write header information flags
  _buffer[index + 3] = (flags >> 24) & 0xff;
  _buffer[index + 2] = (flags >> 16) & 0xff;
  _buffer[index + 1] = (flags >> 8) & 0xff;
  _buffer[index] = (flags) & 0xff;
  index = index + 4;

  // Write collection name
  // index = index + _buffer.write(ns, index, 'utf8') + 1;
  for(var i = 0; i < this.ns.length; i++) {
    _buffer[index + i] = this.ns.charCodeAt(i);
  }
  index = index + this.ns.length + 1;

  _buffer[index - 1] = 0;

  // Write header information flags numberToSkip
  _buffer[index + 3] = (this.numberToSkip >> 24) & 0xff;
  _buffer[index + 2] = (this.numberToSkip >> 16) & 0xff;
  _buffer[index + 1] = (this.numberToSkip >> 8) & 0xff;
  _buffer[index] = (this.numberToSkip) & 0xff;
  index = index + 4;

  // Write header information flags numberToReturn
  _buffer[index + 3] = (this.numberToReturn >> 24) & 0xff;
  _buffer[index + 2] = (this.numberToReturn >> 16) & 0xff;
  _buffer[index + 1] = (this.numberToReturn >> 8) & 0xff;
  _buffer[index] = (this.numberToReturn) & 0xff;
  index = index + 4;

  // Serialize query
  var queryLength = this.bson.serializeWithBufferAndIndex(this.query
    , this.checkKeys
    , _buffer, index
    , this.serializeFunctions) - index + 1;

  // Write header information flags queryLength
  _buffer[index + 3] = (queryLength >> 24) & 0xff;
  _buffer[index + 2] = (queryLength >> 16) & 0xff;
  _buffer[index + 1] = (queryLength >> 8) & 0xff;
  _buffer[index] = (queryLength) & 0xff;
  index = index + 4;

  // Add to the index
  index = index - 4 + queryLength;
  _buffer[index + 1] = 0x00;
  
  // If we have field selectors
  if(this.returnFieldSelector && Object.keys(this.returnFieldSelector).length > 0) {
    var fieldSelectorLength = this.bson.serializeWithBufferAndIndex(this.returnFieldSelector
      , this.checkKeys
      , _buffer
      , index
      , this.serializeFunctions) - index + 1;

    // Write header information flags fieldSelectorLength
    _buffer[index + 3] = (fieldSelectorLength >> 24) & 0xff;
    _buffer[index + 2] = (fieldSelectorLength >> 16) & 0xff;
    _buffer[index + 1] = (fieldSelectorLength >> 8) & 0xff;
    _buffer[index] = (fieldSelectorLength) & 0xff;
    index = index + 4;

    index = index - 4 + fieldSelectorLength;
    _buffer[index + 1] = 0x00;
  }

  // Write total document length
  _buffer[3] = (index >> 24) & 0xff;
  _buffer[2] = (index >> 16) & 0xff;
  _buffer[1] = (index >> 8) & 0xff;
  _buffer[0] = (index) & 0xff;
  // Allocate a new buffer
  var finalBuffer = new Buffer(index);
  _buffer.copy(finalBuffer, 0, 0, index);
  // Return buffer
  return finalBuffer;
}

Query.getRequestId = function() {
  return ++_requestId;
}

/**************************************************************
 * GETMORE
 **************************************************************/
var GetMore = function(bson, ns, cursorId, opts) {
  opts = opts || {};
  this.numberToReturn = opts.numberToReturn || 0;
  this.requestId = _requestId++;
  this.bson = bson;
  this.ns = ns;
  this.cursorId = cursorId;
}

//
// Uses a single allocated buffer for the process, avoiding multiple memory allocations
GetMore.prototype.toBinUnified = function() {
  var length = 4 + Buffer.byteLength(this.ns) + 1 + 4 + 8 + (4 * 4);
  // Create command buffer
  var index = 0;
  
  // Write header information
  // index = write32bit(index, _buffer, length);
  _buffer[index + 3] = (length >> 24) & 0xff;
  _buffer[index + 2] = (length >> 16) & 0xff;
  _buffer[index + 1] = (length >> 8) & 0xff;
  _buffer[index] = (length) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, requestId);
  _buffer[index + 3] = (this.requestId >> 24) & 0xff;
  _buffer[index + 2] = (this.requestId >> 16) & 0xff;
  _buffer[index + 1] = (this.requestId >> 8) & 0xff;
  _buffer[index] = (this.requestId) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, 0);
  _buffer[index + 3] = (0 >> 24) & 0xff;
  _buffer[index + 2] = (0 >> 16) & 0xff;
  _buffer[index + 1] = (0 >> 8) & 0xff;
  _buffer[index] = (0) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, OP_GETMORE);
  _buffer[index + 3] = (OP_GETMORE >> 24) & 0xff;
  _buffer[index + 2] = (OP_GETMORE >> 16) & 0xff;
  _buffer[index + 1] = (OP_GETMORE >> 8) & 0xff;
  _buffer[index] = (OP_GETMORE) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, 0);
  _buffer[index + 3] = (0 >> 24) & 0xff;
  _buffer[index + 2] = (0 >> 16) & 0xff;
  _buffer[index + 1] = (0 >> 8) & 0xff;
  _buffer[index] = (0) & 0xff;
  index = index + 4;

  // Write collection name
  // index = index + _buffer.write(ns, index, 'utf8') + 1;
  for(var i = 0; i < this.ns.length; i++) {
    _buffer[index + i] = this.ns.charCodeAt(i);
  }
  index = index + this.ns.length + 1;
  _buffer[index - 1] = 0;

  // Write batch size
  // index = write32bit(index, _buffer, numberToReturn);
  _buffer[index + 3] = (this.numberToReturn >> 24) & 0xff;
  _buffer[index + 2] = (this.numberToReturn >> 16) & 0xff;
  _buffer[index + 1] = (this.numberToReturn >> 8) & 0xff;
  _buffer[index] = (this.numberToReturn) & 0xff;
  index = index + 4;

  // Write cursor id
  // index = write32bit(index, _buffer, cursorId.getLowBits());
  _buffer[index + 3] = (this.cursorId.getLowBits() >> 24) & 0xff;
  _buffer[index + 2] = (this.cursorId.getLowBits() >> 16) & 0xff;
  _buffer[index + 1] = (this.cursorId.getLowBits() >> 8) & 0xff;
  _buffer[index] = (this.cursorId.getLowBits()) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, cursorId.getHighBits());
  _buffer[index + 3] = (this.cursorId.getHighBits() >> 24) & 0xff;
  _buffer[index + 2] = (this.cursorId.getHighBits() >> 16) & 0xff;
  _buffer[index + 1] = (this.cursorId.getHighBits() >> 8) & 0xff;
  _buffer[index] = (this.cursorId.getHighBits()) & 0xff;
  index = index + 4;

  // Allocate a new buffer
  var finalBuffer = new Buffer(index);
  _buffer.copy(finalBuffer, 0, 0, index);

  // Return buffer
  return finalBuffer;
}

/**************************************************************
 * KILLCURSOR
 **************************************************************/
var KillCursor = function(bson, cursorIds) {
  this.requestId = _requestId++;
  this.cursorIds = cursorIds;
}

//
// Uses a single allocated buffer for the process, avoiding multiple memory allocations
KillCursor.prototype.toBinUnified = function() {
  var length = 4 + 4 + (4 * 4) + (this.cursorIds.length * 8);

  // Create command buffer
  var index = 0;

  // Write header information
  // index = write32bit(index, _buffer, length);
  _buffer[index + 3] = (length >> 24) & 0xff;
  _buffer[index + 2] = (length >> 16) & 0xff;
  _buffer[index + 1] = (length >> 8) & 0xff;
  _buffer[index] = (length) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, requestId);
  _buffer[index + 3] = (this.requestId >> 24) & 0xff;
  _buffer[index + 2] = (this.requestId >> 16) & 0xff;
  _buffer[index + 1] = (this.requestId >> 8) & 0xff;
  _buffer[index] = (this.requestId) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, 0);
  _buffer[index + 3] = (0 >> 24) & 0xff;
  _buffer[index + 2] = (0 >> 16) & 0xff;
  _buffer[index + 1] = (0 >> 8) & 0xff;
  _buffer[index] = (0) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, OP_KILL_CURSORS);
  _buffer[index + 3] = (OP_KILL_CURSORS >> 24) & 0xff;
  _buffer[index + 2] = (OP_KILL_CURSORS >> 16) & 0xff;
  _buffer[index + 1] = (OP_KILL_CURSORS >> 8) & 0xff;
  _buffer[index] = (OP_KILL_CURSORS) & 0xff;
  index = index + 4;

  // index = write32bit(index, _buffer, 0);
  _buffer[index + 3] = (0 >> 24) & 0xff;
  _buffer[index + 2] = (0 >> 16) & 0xff;
  _buffer[index + 1] = (0 >> 8) & 0xff;
  _buffer[index] = (0) & 0xff;
  index = index + 4;

  // Write batch size
  // index = write32bit(index, _buffer, this.cursorIds.length);
  _buffer[index + 3] = (this.cursorIds.length >> 24) & 0xff;
  _buffer[index + 2] = (this.cursorIds.length >> 16) & 0xff;
  _buffer[index + 1] = (this.cursorIds.length >> 8) & 0xff;
  _buffer[index] = (this.cursorIds.length) & 0xff;
  index = index + 4;

  // Write all the cursor ids into the array
  for(var i = 0; i < this.cursorIds.length; i++) {
    // Write cursor id
    // index = write32bit(index, _buffer, cursorIds[i].getLowBits());
    _buffer[index + 3] = (this.cursorIds[i].getLowBits() >> 24) & 0xff;
    _buffer[index + 2] = (this.cursorIds[i].getLowBits() >> 16) & 0xff;
    _buffer[index + 1] = (this.cursorIds[i].getLowBits() >> 8) & 0xff;
    _buffer[index] = (this.cursorIds[i].getLowBits()) & 0xff;
    index = index + 4;

    // index = write32bit(index, _buffer, cursorIds[i].getHighBits());
    _buffer[index + 3] = (this.cursorIds[i].getHighBits() >> 24) & 0xff;
    _buffer[index + 2] = (this.cursorIds[i].getHighBits() >> 16) & 0xff;
    _buffer[index + 1] = (this.cursorIds[i].getHighBits() >> 8) & 0xff;
    _buffer[index] = (this.cursorIds[i].getHighBits()) & 0xff;
    index = index + 4;
  }

  // Allocate a new buffer
  var finalBuffer = new Buffer(index);
  _buffer.copy(finalBuffer, 0, 0, index);

  // Return buffer
  return finalBuffer;
}

var Response = function(bson, data, opts) {
  opts = opts || {promoteLongs: true};
  this.parsed = false;

  //
  // Parse Header
  //
  this.index = 0;
  this.raw = data;
  this.data = data;
  this.bson = bson;
  this.opts = opts;

  // Read the message length
  this.length = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;
  
  // Fetch the request id for this reply
  this.requestId = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;
  
  // Fetch the id of the request that triggered the response
  this.responseTo = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;

  // Skip op-code field
  this.index = this.index + 4;
  
  // Unpack flags
  this.responseFlags = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;
  
  // Unpack the cursor
  var lowBits = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;
  var highBits = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;
  // Create long object
  this.cursorId = new Long(lowBits, highBits);
  
  // Unpack the starting from
  this.startingFrom = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;
  
  // Unpack the number of objects returned
  this.numberReturned = data[this.index] | data[this.index + 1] << 8 | data[this.index + 2] << 16 | data[this.index + 3] << 24;
  this.index = this.index + 4;

  // Preallocate document array
  this.documents = new Array(this.numberReturned);

  // Flag values
  this.cursorNotFound = (this.responseFlags & CURSOR_NOT_FOUND) != 0;
  this.queryFailure = (this.responseFlags & QUERY_FAILURE) != 0;
  this.shardConfigStale = (this.responseFlags & SHARD_CONFIG_STALE) != 0;
  this.awaitCapable = (this.responseFlags & AWAIT_CAPABLE) != 0;
  this.promoteLongs = typeof opts.promoteLongs == 'boolean' ? opts.promoteLongs : true;
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
  for(var i = 0; i < this.numberReturned; i++) {
    var bsonSize = this.data[this.index] | this.data[this.index + 1] << 8 | this.data[this.index + 2] << 16 | this.data[this.index + 3] << 24;
    // Parse options
    var _options = {promoteLongs: this.opts.promoteLongs};

    // If we have raw results specified slice the return document
    if(raw) {
      this.documents[i] = this.data.slice(this.index, this.index + bsonSize);
    } else {
      this.documents[i] = this.bson.deserialize(this.data.slice(this.index, this.index + bsonSize), _options);
    }

    // Adjust the index
    this.index = this.index + bsonSize;
  }

  // Set parsed
  this.parsed = true;
}

module.exports = {
    Query: Query
  , GetMore: GetMore
  , Response: Response
  , KillCursor: KillCursor
}