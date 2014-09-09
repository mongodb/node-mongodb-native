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

  // Ensure empty options
  options = options || {};

  // Unpack options
  var serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  var checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : true;
  var continueOnError = typeof options.continueOnError == 'boolean' ? options.continueOnError : false;
  // Set flags
  var flags = continueOnError ? 1 : 0;

  // To Binary
  this.toBin = function() {
    // Calculate total length of the document
    var length = 4 + Buffer.byteLength(ns) + 1 + (4 * 4);

    // Calculate the size of all documents
    for(var i = 0; i < documents.length; i++) {
      var docsize = bson.calculateObjectSize(documents[i], serializeFunctions, true);

      // Document is larger than maxBsonObjectSize, terminate serialization
      if(docsize > ismaster.maxBsonObjectSize) {
        throw new MongoError("Document exceeds maximum allowed bson size of " + ismaster.maxBsonObjectSize + " bytes");        
      }

      // Add to total command size
      length += docsize;
    }

    // Command is larger than maxMessageSizeBytes terminate serialization
    if(length > ismaster.maxBsonObjectSize) {
      throw new MongoError("Command exceeds maximum message size of " + ismaster.maxMessageSizeBytes + " bytes");
    }

    // Create command buffer
    var buffer = new Buffer(length);
    var index = 0;
    
    // Write header information
    index = write32bit(index, buffer, length);
    index = write32bit(index, buffer, requestId);
    index = write32bit(index, buffer, 0);
    index = write32bit(index, buffer, OP_INSERT);
    
    // Insert part of wire protocol
    index = write32bit(index, buffer, flags);
    // Write collection name
    index = index + buffer.write(ns, index, 'utf8') + 1;
    buffer[index - 1] = 0;

    // Write all the bson documents to the buffer at the index offset
    for(var i = 0; i < documents.length; i++) {
      // Serialize the entry
      var newIndex = bson.serializeWithBufferAndIndex(documents[i], checkKeys, buffer, index, serializeFunctions);
      var docSize = newIndex - index + 1;
      // Write the doc size
      write32bit(index, buffer, docSize);
      // Adjust index
      index = index + docSize;
      // Add terminating 0 for the object
      buffer[index - 1] = 0;      
    }

    return buffer;
  }
}

var Update = function(requestId, ismaster, bson, ns, update, options) {  
  // Basic options needed to be passed in
  if(ns == null) throw new MongoError("ns must be specified for query");

  // Ensure empty options
  options = options || {};

  // Unpack options
  var serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  var checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : false;

  // Unpack the update document
  var upsert = typeof update[0].upsert == 'boolean' ? update[0].upsert : false;
  var multi = typeof update[0].multi == 'boolean' ? update[0].multi : false;
  var q = update[0].q;
  var u = update[0].u;

  // Create flag value
  var flags = upsert ? 1 : 0;
  flags = multi ? flags | 2 : flags;

  // To Binary
  this.toBin = function() {
    // Calculate total length of the document
    var length = (4 * 4) + 4 + Buffer.byteLength(ns) + 1 + 4;

    // Calculate the two object sizes
    var qSize = bson.calculateObjectSize(q, serializeFunctions, true);
    var uSize = bson.calculateObjectSize(u, serializeFunctions, true);

    // Update the length
    length = length + qSize + uSize;
    // Create command buffer
    var buffer = new Buffer(length);
    var index = 0;

    // Write header information
    index = write32bit(index, buffer, length);
    index = write32bit(index, buffer, requestId);
    index = write32bit(index, buffer, 0);
    index = write32bit(index, buffer, OP_UPDATE);

    // Write ZERO
    index = write32bit(index, buffer, 0);

    // Write collection name
    index = index + buffer.write(ns, index, 'utf8') + 1;
    buffer[index - 1] = 0;

    // Write ZERO
    index = write32bit(index, buffer, flags);

    // Serialize the selector
    var length = bson.serializeWithBufferAndIndex(q, checkKeys, buffer, index, serializeFunctions) - index + 1;
    write32bit(index, buffer, length);
    index = index + length;
    // Serialize the update statement
    length = bson.serializeWithBufferAndIndex(u, false, buffer, index, serializeFunctions) - index + 1;
    write32bit(index, buffer, length);
    index = index + length;

    // Return the buffer
    return buffer;
  }
}

var Remove = function(requestId, ismaster, bson, ns, remove, options) {  
  // Basic options needed to be passed in
  if(ns == null) throw new MongoError("ns must be specified for query");

  // Ensure empty options
  options = options || {};

  // Unpack options
  var serializeFunctions = typeof options.serializeFunctions == 'boolean' ? options.serializeFunctions : false;
  var checkKeys = typeof options.checkKeys == 'boolean' ? options.checkKeys : false;

  // Unpack the update document
  var limit = typeof remove[0].limit == 'number' ? remove[0].limit : 1;
  var q = remove[0].q;

  // Create flag value
  var flags = limit == 1 ? 1 : 0;

  // To Binary
  this.toBin = function() {
    // Calculate total length of the document
    var length = (4 * 4) + 4 + Buffer.byteLength(ns) + 1 + 4;

    // Calculate the two object sizes
    var qSize = bson.calculateObjectSize(q, serializeFunctions, true);

    // Update the length
    length = length + qSize;
    // Create command buffer
    var buffer = new Buffer(length);
    var index = 0;

    // Write header information
    index = write32bit(index, buffer, length);
    index = write32bit(index, buffer, requestId);
    index = write32bit(index, buffer, 0);
    index = write32bit(index, buffer, OP_DELETE);

    // Write ZERO
    index = write32bit(index, buffer, 0);

    // Write collection name
    index = index + buffer.write(ns, index, 'utf8') + 1;
    buffer[index - 1] = 0;

    // Write ZERO
    index = write32bit(index, buffer, flags);

    // Serialize the selector
    var length = bson.serializeWithBufferAndIndex(q, checkKeys, buffer, index, serializeFunctions) - index + 1;
    write32bit(index, buffer, length);
    index = index + length;

    // Return the buffer
    return buffer;
  }
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
    Insert: Insert
  , Update: Update
  , Remove: Remove
}