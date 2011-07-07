var BaseCommand = require('./base_command').BaseCommand,
  BinaryParser = require('../bson/binary_parser').BinaryParser,
  inherits = require('util').inherits,
  debug = require('util').debug,
  inspect = require('util').inspect;

/**
  Update Document Command
**/
var UpdateCommand = exports.UpdateCommand = function(db, collectionName, spec, document, options) {
  this.collectionName = collectionName;
  this.spec = spec;
  this.document = document;
  this.db = db;

  // Generate correct flags
  var db_upsert = 0;
  var db_multi_update = 0;
  db_upsert = options != null && options['upsert'] != null ? (options['upsert'] == true ? 1 : 0) : db_upsert;
  db_multi_update = options != null && options['multi'] != null ? (options['multi'] == true ? 1 : 0) : db_multi_update;

  // Flags
  this.flags = parseInt(db_multi_update.toString() + db_upsert.toString(), 2);
};

UpdateCommand.OP_UPDATE = 2001;

UpdateCommand.prototype.getOpCode = function() {
  return UpdateCommand.OP_UPDATE;
};

/*
struct {
    MsgHeader header;             // standard message header
    int32     ZERO;               // 0 - reserved for future use
    cstring   fullCollectionName; // "dbname.collectionname"
    int32     flags;              // bit vector. see below
    BSON      spec;               // the query to select the document
    BSON      document;           // the document data to update with or insert
}
*/
UpdateCommand.prototype.getCommandAsBuffers = function(buffers) {
  var collectionNameBuffers = BaseCommand.encodeCString(this.collectionName);
  var specCommand = this.db.bson_serializer.BSON.serialize(this.spec, false, true);
  var docCommand = this.db.bson_serializer.BSON.serialize(this.document, false, true);

  var totalObjectLength = 4 + collectionNameBuffers[0].length + 1 + 4 + specCommand.length + docCommand.length;
  buffers.push(BaseCommand.encodeInt(0), collectionNameBuffers[0], collectionNameBuffers[1],
            BaseCommand.encodeInt(this.flags), specCommand, docCommand);
  return totalObjectLength;
}

UpdateCommand.prototype.toBinary = function() {
  //////////////////////////////////////////////////////////////////////////////////////
  // Calculate total length of the document
  var totalLengthOfCommand = 4 + Buffer.byteLength(this.collectionName) + 1 + 4 + this.db.bson_serializer.BSON.calculateObjectSize(this.spec) +
      this.db.bson_serializer.BSON.calculateObjectSize(this.document) + (4 * 4);

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
  _command[_index + 3] = (UpdateCommand.OP_UPDATE >> 24) & 0xff;     
  _command[_index + 2] = (UpdateCommand.OP_UPDATE >> 16) & 0xff;
  _command[_index + 1] = (UpdateCommand.OP_UPDATE >> 8) & 0xff;
  _command[_index] = UpdateCommand.OP_UPDATE & 0xff;
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

  // Write the update flags
  _command[_index + 3] = (this.flags >> 24) & 0xff;     
  _command[_index + 2] = (this.flags >> 16) & 0xff;
  _command[_index + 1] = (this.flags >> 8) & 0xff;
  _command[_index] = this.flags & 0xff;
  // Adjust index
  _index = _index + 4;

  // Serialize the spec document
  var documentLength = this.db.bson_serializer.BSON.serializeWithBufferAndIndex(this.spec, this.checkKeys, _command, _index) - _index + 1;
  // Write the length to the document
  _command[_index + 3] = (documentLength >> 24) & 0xff;     
  _command[_index + 2] = (documentLength >> 16) & 0xff;
  _command[_index + 1] = (documentLength >> 8) & 0xff;
  _command[_index] = documentLength & 0xff;
  // Update index in buffer
  _index = _index + documentLength;
  // Add terminating 0 for the object
  _command[_index - 1] = 0;    

  // Serialize the document
  var documentLength = this.db.bson_serializer.BSON.serializeWithBufferAndIndex(this.document, this.checkKeys, _command, _index) - _index + 1;
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

// Constants
UpdateCommand.DB_UPSERT = 0;
UpdateCommand.DB_MULTI_UPDATE = 1;

UpdateCommand.encodeInt = function(value) {
  var buffer = new Buffer(4);
  buffer[3] = (value >> 24) & 0xff;      
  buffer[2] = (value >> 16) & 0xff;
  buffer[1] = (value >> 8) & 0xff;
  buffer[0] = value & 0xff;
  return buffer;
}

UpdateCommand.encodeIntInPlace = function(value, buffer, index) {
  buffer[index + 3] = (value >> 24) & 0xff;			
	buffer[index + 2] = (value >> 16) & 0xff;
	buffer[index + 1] = (value >> 8) & 0xff;
	buffer[index] = value & 0xff;
}

UpdateCommand.encodeCString = function(string) {
  var buf = new Buffer(string, 'utf8');
  return [buf, new Buffer([0])];
}

// var id = 1;
// BaseCommand.prototype.getRequestId = function() {
//   if (!this.requestId) this.requestId = id++;
//   return this.requestId;
// };