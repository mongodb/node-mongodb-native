var BaseCommand = require('./base_command').BaseCommand,
  BinaryParser = require('../bson/binary_parser').BinaryParser,
  inherits = require('util').inherits,
  debug = require('util').debug,
  inspect = require('util').inspect,
  binaryutils = require('../bson/binary_utils');

/**
  Get More Document Command
**/
var GetMoreCommand = exports.GetMoreCommand = function(db, collectionName, numberToReturn, cursorId) {
  this.collectionName = collectionName;
  this.numberToReturn = numberToReturn;
  this.cursorId = cursorId;
  this.db = db;
};

GetMoreCommand.OP_GET_MORE = 2005;

GetMoreCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_GET_MORE;
};

GetMoreCommand.prototype.getCommandAsBuffers = function(buffers) {
  var collectionNameBuffers = BaseCommand.encodeCString(this.collectionName);
  var totalObjectLength = 4 + 4 + collectionNameBuffers[0].length + 1 + 8;
  
  // Push headers
  buffers.push(BaseCommand.encodeInt(0), collectionNameBuffers[0], collectionNameBuffers[1], BaseCommand.encodeInt(this.numberToReturn));

  var longBuffer = new Buffer(8);
  binaryutils.encodeIntInPlace(this.cursorId.getLowBits(), longBuffer, 0);
  binaryutils.encodeIntInPlace(this.cursorId.getHighBits(), longBuffer, 4);

  // Add values to buffer
  buffers.push(longBuffer);
  // Return total value
  return totalObjectLength;
}

GetMoreCommand.prototype.toBinary = function() {
  //////////////////////////////////////////////////////////////////////////////////////
  // Calculate total length of the document
  var totalLengthOfCommand = 4 + Buffer.byteLength(this.collectionName) + 1 + 4 + 8 + (4 * 4);
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
  _command[_index + 3] = (GetMoreCommand.OP_GET_MORE >> 24) & 0xff;     
  _command[_index + 2] = (GetMoreCommand.OP_GET_MORE >> 16) & 0xff;
  _command[_index + 1] = (GetMoreCommand.OP_GET_MORE >> 8) & 0xff;
  _command[_index] = GetMoreCommand.OP_GET_MORE & 0xff;
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

  // Number of documents to return
  _command[_index + 3] = (this.numberToReturn >> 24) & 0xff;     
  _command[_index + 2] = (this.numberToReturn >> 16) & 0xff;
  _command[_index + 1] = (this.numberToReturn >> 8) & 0xff;
  _command[_index] = this.numberToReturn & 0xff;
  // Adjust index
  _index = _index + 4;
  
  // Encode the cursor id
  var low_bits = this.cursorId.getLowBits();
  // Encode low bits
  _command[_index + 3] = (low_bits >> 24) & 0xff;     
  _command[_index + 2] = (low_bits >> 16) & 0xff;
  _command[_index + 1] = (low_bits >> 8) & 0xff;
  _command[_index] = low_bits & 0xff;
  // Adjust index
  _index = _index + 4;
  
  var high_bits = this.cursorId.getHighBits();
  // Encode high bits
  _command[_index + 3] = (high_bits >> 24) & 0xff;     
  _command[_index + 2] = (high_bits >> 16) & 0xff;
  _command[_index + 1] = (high_bits >> 8) & 0xff;
  _command[_index] = high_bits & 0xff;
  // Adjust index
  _index = _index + 4;
  
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
GetMoreCommand.prototype.getRequestId = function() {
  if (!this.requestId) this.requestId = id++;
  return this.requestId;
};

GetMoreCommand.encodeInt = function(value) {
  var buffer = new Buffer(4);
  buffer[3] = (value >> 24) & 0xff;      
  buffer[2] = (value >> 16) & 0xff;
  buffer[1] = (value >> 8) & 0xff;
  buffer[0] = value & 0xff;
  return buffer;
}

GetMoreCommand.encodeIntInPlace = function(value, buffer, index) {
  buffer[index + 3] = (value >> 24) & 0xff;			
	buffer[index + 2] = (value >> 16) & 0xff;
	buffer[index + 1] = (value >> 8) & 0xff;
	buffer[index] = value & 0xff;
}

GetMoreCommand.encodeCString = function(string) {
  var buf = new Buffer(string, 'utf8');
  return [buf, new Buffer([0])];
}

