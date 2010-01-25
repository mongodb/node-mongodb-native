sys = require("sys");


/**
  Base object used for common functionality
**/
BaseCommand = function() {  
  this.bson = new BSON();
}

// OpCodes
BaseCommand.OP_REPLY = 1;
BaseCommand.OP_MSG = 1000;
BaseCommand.OP_UPDATE = 2001;
BaseCommand.OP_INSERT =	2002;
BaseCommand.OP_GET_BY_OID = 2003;
BaseCommand.OP_QUERY = 2004;
BaseCommand.OP_GET_MORE = 2005;
BaseCommand.OP_DELETE =	2006;
BaseCommand.OP_KILL_CURSORS =	2007;

BaseCommand.prototype = new Object();
BaseCommand.prototype.toBinary = function() {
  // Get the command op code
  var op_code = this.getOpCode();
  
  // Get the command data structure
  var command = this.getCommand();
  // Total Size of command
  var totalSize = 4*4 + command.length;
  // Create the command with the standard header file
  return BinaryParser.fromInt(totalSize) + BinaryParser.fromInt(this.requestId) + BinaryParser.fromInt(0) + BinaryParser.fromInt(op_code) + command;
}

BaseCommand.prototype.getRequestId = function() {
  // Generate request id if missing for the command
  this.requestId = this.requestId == undefined ? RequestIdGenerator.getRequestId() : this.requestId;
  return this.requestId;
}

/**
  Request id generator
**/
RequestIdGenerator = function() {  
}

// requestID incrementing global vaue for BaseCommand for unique query identifier
RequestIdGenerator.requestID = 1;
RequestIdGenerator.getRequestId = function() {
  // Get current request id
  var requestId = RequestIdGenerator.requestID;
  // Increment request id
  RequestIdGenerator.requestID = RequestIdGenerator.requestID + 1;
  return requestId;
}
