require('mongodb/lang/oo');
sys = require("sys");

var mongo = require('mongodb/bson/binary_parser');

/**
  Base object used for common functionality
**/
exports.BaseCommand = Class({
  init: function() {},
  
  toBinary: function() {
    // Get the command op code
    var op_code = this.getOpCode();
    // Get the command data structure
    var command = this.getCommand();
    // Total Size of command
    var totalSize = 4*4 + command.length;
    // Create the command with the standard header file
    return mongo.BinaryParser.fromInt(totalSize) + mongo.BinaryParser.fromInt(this.requestId) + mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.fromInt(op_code) + command;
  },
  
  getRequestId: function() {
    // Generate request id if missing for the command
    this.requestId = this.requestId == undefined ? exports.RequestIdGenerator.getRequestId() : this.requestId;
    return this.requestId;
  }  
})

// OpCodes
exports.BaseCommand.OP_REPLY = 1;
exports.BaseCommand.OP_MSG = 1000;
exports.BaseCommand.OP_UPDATE = 2001;
exports.BaseCommand.OP_INSERT =	2002;
exports.BaseCommand.OP_GET_BY_OID = 2003;
exports.BaseCommand.OP_QUERY = 2004;
exports.BaseCommand.OP_GET_MORE = 2005;
exports.BaseCommand.OP_DELETE =	2006;
exports.BaseCommand.OP_KILL_CURSORS =	2007;

/**
  Request id generator
**/
exports.RequestIdGenerator = Class({
})
// requestID incrementing global vaue for BaseCommand for unique query identifier
exports.RequestIdGenerator.requestID = 1;
exports.RequestIdGenerator.getRequestId = function() {
  // Get current request id
  var requestId = exports.RequestIdGenerator.requestID;
  // Increment request id
  exports.RequestIdGenerator.requestID = exports.RequestIdGenerator.requestID + 1;
  return requestId;
}
