var mongo = require('mongodb/bson/binary_parser');
process.mixin(mongo, require('mongodb/commands/base_command'));
process.mixin(mongo, require('mongodb/bson/bson'));

/**
  Get More Document Command
**/
var GetMoreCommand = exports.GetMoreCommand = function(collectionName, numberToReturn, cursorId) {
  mongo.BaseCommand.call(this);
 
  this.collectionName = collectionName;
  this.numberToReturn = numberToReturn;
  this.cursorId = cursorId;
  this.className = "GetMoreCommand";
};

process.inherits(GetMoreCommand, mongo.BaseCommand);

GetMoreCommand.prototype.getOpCode = function() {
  return mongo.BaseCommand.OP_GET_MORE;
};

GetMoreCommand.prototype.getCommand = function() {
  // Generate the command string
  return mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.encode_utf8(this.collectionName) + mongo.BinaryParser.fromByte(0) + mongo.BinaryParser.fromInt(this.numberToReturn) + mongo.BSON.encodeLong(this.cursorId);
};