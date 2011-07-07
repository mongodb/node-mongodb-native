var BaseCommand = require('./base_command').BaseCommand,
  BinaryParser = require('../bson/binary_parser').BinaryParser,
  inherits = require('util').inherits,
  debug = require('util').debug, 
  inspect = require('util').inspect;

/**
  Insert Document Command
**/
var DeleteCommand = exports.DeleteCommand = function(db, collectionName, selector) {
  this.collectionName = collectionName;
  this.selector = selector;
  this.db = db;
};

// inherits(DeleteCommand, BaseCommand);

DeleteCommand.OP_DELETE =	2006;

DeleteCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_DELETE;
};

/*
struct {
    MsgHeader header;                 // standard message header
    int32     ZERO;                   // 0 - reserved for future use
    cstring   fullCollectionName;     // "dbname.collectionname"
    int32     ZERO;                   // 0 - reserved for future use
    mongo.BSON      selector;               // query object.  See below for details.
}
*/
DeleteCommand.prototype.getCommandAsBuffers = function(buffers) {
  var collectionNameBuffers = BaseCommand.encodeCString(this.collectionName);
  var totalObjectLength = 4 + 4 + collectionNameBuffers[0].length + 1;
  // Long command for cursor
  var selectorCommand = this.db.bson_serializer.BSON.serialize(this.selector, false, true);
  totalObjectLength += selectorCommand.length;
  // Push headers
  buffers.push(BaseCommand.encodeInt(0), collectionNameBuffers[0], collectionNameBuffers[1], BaseCommand.encodeInt(0), selectorCommand);
  return totalObjectLength;
}

DeleteCommand.prototype.toBinary = function() {
  //////////////////////////////////////////////////////////////////////////////////////
  // Calculate total length of the document
  var totalLengthOfCommand = 4 + Buffer.byteLength(this.collectionName) + 1 + 4 + this.db.bson_serializer.BSON.calculateObjectSize(this.selector) + (4 * 4);
  // Let's build the single pass buffer command
  var _index = 0;
  var _command = new Buffer(totalLengthOfCommand);
  // Write the header information to the buffer
  _command[_index + 3] = (totalLengthOfCommand >> 24) & 0xff;     
  _command[_index + 2] = (totalLengthOfCommand >> 16) & 0xff;
  _command[_index + 1] = (totalLengthOfCommand >> 8) & 0xff;
  _command[_index] = totalLengthOfCommand & 0xff;
  // Adjust index
  _index = _index + 4;
  // Write the request ID
  _command[_index + 3] = (this.requestId >> 24) & 0xff;     
  _command[_index + 2] = (this.requestId >> 16) & 0xff;
  _command[_index + 1] = (this.requestId >> 8) & 0xff;
  _command[_index] = this.requestId & 0xff;
  // Adjust index
  _index = _index + 4;
  // Write zero
  _command[_index++] = 0;
  _command[_index++] = 0;
  _command[_index++] = 0;
  _command[_index++] = 0;
  // Write the op_code for the command
  _command[_index + 3] = (DeleteCommand.OP_DELETE >> 24) & 0xff;     
  _command[_index + 2] = (DeleteCommand.OP_DELETE >> 16) & 0xff;
  _command[_index + 1] = (DeleteCommand.OP_DELETE >> 8) & 0xff;
  _command[_index] = DeleteCommand.OP_DELETE & 0xff;
  // Adjust index
  _index = _index + 4;

  // Write zero
  _command[_index++] = 0;
  _command[_index++] = 0;
  _command[_index++] = 0;
  _command[_index++] = 0;

  // Write the collection name to the command
  _index = _index + _command.write(this.collectionName, _index, 'utf8') + 1;
  _command[_index - 1] = 0;    

  // Write zero
  _command[_index++] = 0;
  _command[_index++] = 0;
  _command[_index++] = 0;
  _command[_index++] = 0;
  
  // Serialize the selector
  var documentLength = this.db.bson_serializer.BSON.serializeWithBufferAndIndex(this.selector, this.checkKeys, _command, _index) - _index + 1;
  // Write the length to the document
  _command[_index + 3] = (documentLength >> 24) & 0xff;     
  _command[_index + 2] = (documentLength >> 16) & 0xff;
  _command[_index + 1] = (documentLength >> 8) & 0xff;
  _command[_index] = documentLength & 0xff;
  // Update index in buffer
  _index = _index + documentLength;
  // Add terminating 0 for the object
  _command[_index - 1] = 0;    
  
  return _command;
  //////////////////////////////////////////////////////////////////////////////////////

  // Build list of Buffer objects to write out
  var buffers = [];

  // Get the command op code
  var op_code = this.getOpCode();
  var commandBuffers = [];

  // Get the command data structure
  var commandLength = this.getCommandAsBuffers(commandBuffers);
  // Total Size of command
  var totalSize = 4*4 + commandLength;
  // Encode totalSize, requestId, responseId and opcode
  buffers.push(BaseCommand.encodeInt(totalSize), BaseCommand.encodeInt(this.requestId), BaseCommand.encodeInt(0), BaseCommand.encodeInt(op_code));
  
  // Add the command items
  buffers = buffers.concat(commandBuffers);
  // Allocate single buffer for write
  var finalBuffer = new Buffer(totalSize);
  
  var index = 0;

  for(var i = 0; i < buffers.length; i++) {
    buffers[i].copy(finalBuffer, index);
    index = index + buffers[i].length;
  }
  
  for(var i = 0; i < finalBuffer.length; i++) {
    debug(i + " :: [" + _command[i] + "] = [" + finalBuffer[i] + "]" + (_command[i] != finalBuffer[i] ? " = FALSE" : ""))
  }  
  
  debug("===================================== finalBuffer.length :: " + finalBuffer.length)
  debug("===================================== totalLengthOfCommand :: " + totalLengthOfCommand)  
  
  return finalBuffer;
};

var id = 1;
DeleteCommand.prototype.getRequestId = function() {
  if (!this.requestId) this.requestId = id++;
  return this.requestId;
};

DeleteCommand.encodeInt = function(value) {
  var buffer = new Buffer(4);
  buffer[3] = (value >> 24) & 0xff;      
  buffer[2] = (value >> 16) & 0xff;
  buffer[1] = (value >> 8) & 0xff;
  buffer[0] = value & 0xff;
  return buffer;
}

DeleteCommand.encodeIntInPlace = function(value, buffer, index) {
  buffer[index + 3] = (value >> 24) & 0xff;			
	buffer[index + 2] = (value >> 16) & 0xff;
	buffer[index + 1] = (value >> 8) & 0xff;
	buffer[index] = value & 0xff;
}

DeleteCommand.encodeCString = function(string) {
  var buf = new Buffer(string, 'utf8');
  return [buf, new Buffer([0])];
}


