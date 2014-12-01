"use strict";

var MongoError = require('../error');

// Wire command operation ids
var OP_UPDATE = 2001;
var OP_INSERT = 2002;
var OP_DELETE = 2006;

var Insert = function(requestId, ismaster, bson, ns, documents, options) {
  // Basic options needed to be passed in
  if(ns == null) throw new MongoError("ns must be specified for query");
  if(!Array.isArray(documents) || documents.length == 0) throw new MongoError("documents array must contain at least one document to insert");

  // Validate that we are not passing 0x00 in the colletion name
  if(!!~ns.indexOf("\x00")) {
    throw new MongoError("namespace cannot contain a null character");
  }

  // Set internal
  this.requestId = requestId;
  this.bson = bson;
  this.ns = ns;
  this.documents = documents;
  this.ismaster = ismaster;

  // Ensure empty options
  options = options || {};

  // Unpack options
  this.serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  this.checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : true;
  this.continueOnError = typeof options.continueOnError == 'boolean' ? options.continueOnError : false;
  // Set flags
  this.flags = this.continueOnError ? 1 : 0;
}

// To Binary
Insert.prototype.toBin = function() {
  // Calculate total length of the document
  var length = 4 + Buffer.byteLength(this.ns) + 1 + (4 * 4);

  // Calculate the size of all documents
  for(var i = 0; i < this.documents.length; i++) {
    var docsize = this.bson.calculateObjectSize(this.documents[i], this.serializeFunctions, true);

    // Document is larger than maxBsonObjectSize, terminate serialization
    if(docsize > this.ismaster.maxBsonObjectSize) {
      throw new MongoError("Document exceeds maximum allowed bson size of " + this.ismaster.maxBsonObjectSize + " bytes");        
    }

    // Add to total command size
    length += docsize;
  }

  // Command is larger than maxMessageSizeBytes terminate serialization
  if(length > this.ismaster.maxBsonObjectSize) {
    throw new MongoError("Command exceeds maximum message size of " + this.ismaster.maxMessageSizeBytes + " bytes");
  }

  // Create command buffer
  var buffer = new Buffer(length);
  var index = 0;
  
  // Write header length
  buffer[index + 3] = (length >> 24) & 0xff;
  buffer[index + 2] = (length >> 16) & 0xff;
  buffer[index + 1] = (length >> 8) & 0xff;
  buffer[index] = (length) & 0xff;
  index = index + 4;

  // Write header requestId
  buffer[index + 3] = (this.requestId >> 24) & 0xff;
  buffer[index + 2] = (this.requestId >> 16) & 0xff;
  buffer[index + 1] = (this.requestId >> 8) & 0xff;
  buffer[index] = (this.requestId) & 0xff;
  index = index + 4;

  // No flags
  buffer[index + 3] = (0 >> 24) & 0xff;
  buffer[index + 2] = (0 >> 16) & 0xff;
  buffer[index + 1] = (0 >> 8) & 0xff;
  buffer[index] = (0) & 0xff;
  index = index + 4;

  // Operation
  buffer[index + 3] = (OP_INSERT >> 24) & 0xff;
  buffer[index + 2] = (OP_INSERT >> 16) & 0xff;
  buffer[index + 1] = (OP_INSERT >> 8) & 0xff;
  buffer[index] = (OP_INSERT) & 0xff;
  index = index + 4;

  // Flags
  buffer[index + 3] = (this.flags >> 24) & 0xff;
  buffer[index + 2] = (this.flags >> 16) & 0xff;
  buffer[index + 1] = (this.flags >> 8) & 0xff;
  buffer[index] = (this.flags) & 0xff;
  index = index + 4;

  // Write collection name
  index = index + buffer.write(this.ns, index, 'utf8') + 1;
  buffer[index - 1] = 0;

  // Write all the bson documents to the buffer at the index offset
  for(var i = 0; i < this.documents.length; i++) {
    // Serialize the entry
    var newIndex = this.bson.serializeWithBufferAndIndex(this.documents[i], this.checkKeys, buffer, index, this.serializeFunctions);
    var docSize = newIndex - index + 1;
    // Write the doc size
    buffer[index + 3] = (docSize >> 24) & 0xff;
    buffer[index + 2] = (docSize >> 16) & 0xff;
    buffer[index + 1] = (docSize >> 8) & 0xff;
    buffer[index] = (docSize) & 0xff;
    // Adjust index
    index = index + docSize;
    // Add terminating 0 for the object
    buffer[index - 1] = 0;      
  }

  return buffer;
}

var Update = function(requestId, ismaster, bson, ns, update, options) {  
  // Basic options needed to be passed in
  if(ns == null) throw new MongoError("ns must be specified for query");

  // Ensure empty options
  options = options || {};

  // Set internal
  this.requestId = requestId;
  this.bson = bson;
  this.ns = ns;
  this.ismaster = ismaster;

  // Unpack options
  this.serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  this.checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : false;

  // Unpack the update document
  this.upsert = typeof update[0].upsert == 'boolean' ? update[0].upsert : false;
  this.multi = typeof update[0].multi == 'boolean' ? update[0].multi : false;
  this.q = update[0].q;
  this.u = update[0].u;

  // Create flag value
  this.flags = this.upsert ? 1 : 0;
  this.flags = this.multi ? this.flags | 2 : this.flags;
}

// To Binary
Update.prototype.toBin = function() {
  // Calculate total length of the document
  var length = (4 * 4) + 4 + Buffer.byteLength(this.ns) + 1 + 4;

  // Calculate the two object sizes
  var qSize = this.bson.calculateObjectSize(this.q, this.serializeFunctions, true);
  var uSize = this.bson.calculateObjectSize(this.u, this.serializeFunctions, true);

  // Update the length
  length = length + qSize + uSize;
  
  // Create command buffer
  var buffer = new Buffer(length);
  var index = 0;

  // Write header length
  buffer[index + 3] = (length >> 24) & 0xff;
  buffer[index + 2] = (length >> 16) & 0xff;
  buffer[index + 1] = (length >> 8) & 0xff;
  buffer[index] = (length) & 0xff;
  index = index + 4;

  // Write header requestId
  buffer[index + 3] = (this.requestId >> 24) & 0xff;
  buffer[index + 2] = (this.requestId >> 16) & 0xff;
  buffer[index + 1] = (this.requestId >> 8) & 0xff;
  buffer[index] = (this.requestId) & 0xff;
  index = index + 4;

  // No flags
  buffer[index + 3] = (0 >> 24) & 0xff;
  buffer[index + 2] = (0 >> 16) & 0xff;
  buffer[index + 1] = (0 >> 8) & 0xff;
  buffer[index] = (0) & 0xff;
  index = index + 4;

  // Operation
  buffer[index + 3] = (OP_UPDATE >> 24) & 0xff;
  buffer[index + 2] = (OP_UPDATE >> 16) & 0xff;
  buffer[index + 1] = (OP_UPDATE >> 8) & 0xff;
  buffer[index] = (OP_UPDATE) & 0xff;
  index = index + 4;

  // Write ZERO
  buffer[index + 3] = (0 >> 24) & 0xff;
  buffer[index + 2] = (0 >> 16) & 0xff;
  buffer[index + 1] = (0 >> 8) & 0xff;
  buffer[index] = (0) & 0xff;
  index = index + 4;

  // Write collection name
  index = index + buffer.write(this.ns, index, 'utf8') + 1;
  buffer[index - 1] = 0;

  // Flags
  buffer[index + 3] = (this.flags >> 24) & 0xff;
  buffer[index + 2] = (this.flags >> 16) & 0xff;
  buffer[index + 1] = (this.flags >> 8) & 0xff;
  buffer[index] = (this.flags) & 0xff;
  index = index + 4;

  // Serialize the selector
  var length = this.bson.serializeWithBufferAndIndex(this.q, this.checkKeys, buffer, index, this.serializeFunctions) - index + 1;
  buffer[index + 3] = (length >> 24) & 0xff;
  buffer[index + 2] = (length >> 16) & 0xff;
  buffer[index + 1] = (length >> 8) & 0xff;
  buffer[index] = (length) & 0xff;
  index = index + length;

  // Serialize the update statement
  length = this.bson.serializeWithBufferAndIndex(this.u, false, buffer, index, this.serializeFunctions) - index + 1;
  buffer[index + 3] = (length >> 24) & 0xff;
  buffer[index + 2] = (length >> 16) & 0xff;
  buffer[index + 1] = (length >> 8) & 0xff;
  buffer[index] = (length) & 0xff;  
  index = index + length;

  // Return the buffer
  return buffer;
}


var Remove = function(requestId, ismaster, bson, ns, remove, options) {  
  // Basic options needed to be passed in
  if(ns == null) throw new MongoError("ns must be specified for query");

  // Ensure empty options
  options = options || {};

  // Set internal
  this.requestId = requestId;
  this.bson = bson;
  this.ns = ns;
  this.ismaster = ismaster;

  // Unpack options
  this.serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  this.checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : false;

  // Unpack the update document
  this.limit = typeof remove[0].limit == 'number' ? remove[0].limit : 1;
  this.q = remove[0].q;

  // Create flag value
  this.flags = this.limit == 1 ? 1 : 0;
}

// To Binary
Remove.prototype.toBin = function() {
  // Calculate total length of the document
  var length = (4 * 4) + 4 + Buffer.byteLength(this.ns) + 1 + 4;

  // Calculate the two object sizes
  var qSize = this.bson.calculateObjectSize(this.q, this.serializeFunctions, true);

  // Update the length
  length = length + qSize;
  // Create command buffer
  var buffer = new Buffer(length);
  var index = 0;

  // Write header length
  buffer[index + 3] = (length >> 24) & 0xff;
  buffer[index + 2] = (length >> 16) & 0xff;
  buffer[index + 1] = (length >> 8) & 0xff;
  buffer[index] = (length) & 0xff;
  index = index + 4;

  // Write header requestId
  buffer[index + 3] = (this.requestId >> 24) & 0xff;
  buffer[index + 2] = (this.requestId >> 16) & 0xff;
  buffer[index + 1] = (this.requestId >> 8) & 0xff;
  buffer[index] = (this.requestId) & 0xff;
  index = index + 4;

  // No flags
  buffer[index + 3] = (0 >> 24) & 0xff;
  buffer[index + 2] = (0 >> 16) & 0xff;
  buffer[index + 1] = (0 >> 8) & 0xff;
  buffer[index] = (0) & 0xff;
  index = index + 4;

  // Operation
  buffer[index + 3] = (OP_DELETE >> 24) & 0xff;
  buffer[index + 2] = (OP_DELETE >> 16) & 0xff;
  buffer[index + 1] = (OP_DELETE >> 8) & 0xff;
  buffer[index] = (OP_DELETE) & 0xff;
  index = index + 4;

  // Write ZERO
  buffer[index + 3] = (0 >> 24) & 0xff;
  buffer[index + 2] = (0 >> 16) & 0xff;
  buffer[index + 1] = (0 >> 8) & 0xff;
  buffer[index] = (0) & 0xff;
  index = index + 4;

  // Write collection name
  index = index + buffer.write(this.ns, index, 'utf8') + 1;
  buffer[index - 1] = 0;

  // Write ZERO
  buffer[index + 3] = (this.flags >> 24) & 0xff;
  buffer[index + 2] = (this.flags >> 16) & 0xff;
  buffer[index + 1] = (this.flags >> 8) & 0xff;
  buffer[index] = (this.flags) & 0xff;
  index = index + 4;

  // Serialize the selector
  var length = this.bson.serializeWithBufferAndIndex(this.q, this.checkKeys, buffer, index, this.serializeFunctions) - index + 1;
  buffer[index + 3] = (length >> 24) & 0xff;
  buffer[index + 2] = (length >> 16) & 0xff;
  buffer[index + 1] = (length >> 8) & 0xff;
  buffer[index] = (length) & 0xff;  
  index = index + length;

  // Return the buffer
  return buffer;
}

module.exports = {
    Insert: Insert
  , Update: Update
  , Remove: Remove
}