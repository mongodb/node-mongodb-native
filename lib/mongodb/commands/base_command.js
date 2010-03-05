sys = require("sys");

var mongo = require('mongodb/bson/binary_parser'),
  RequestIdGenerator = require('./request_id_generator');

/**
  Base object used for common functionality
**/
var BaseCommand = exports.BaseCommand = function() {
  this.className = "BaseCommand";
};

BaseCommand.prototype.toBinary = function() {
  // Get the command op code
  var op_code = this.getOpCode();
  // Get the command data structure
  var command = this.getCommand();
  // Total Size of command
  var totalSize = 4*4 + command.length;
  // Create the command with the standard header file
  return mongo.BinaryParser.fromInt(totalSize) + mongo.BinaryParser.fromInt(this.requestId) + mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.fromInt(op_code) + command;
};

BaseCommand.prototype.getRequestId = function() {
  // Generate request id if missing for the command
  this.requestId = this.requestId == undefined ? RequestIdGenerator.getRequestId() : this.requestId;
  return this.requestId;
};

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
