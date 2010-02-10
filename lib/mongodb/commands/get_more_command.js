var mongo = require('mongodb/bson/binary_parser');
process.mixin(mongo, require('mongodb/commands/base_command'));
process.mixin(mongo, require('mongodb/bson/bson'));

/**
  Get More Document Command
**/
exports.GetMoreCommand = mongo.BaseCommand.extend({
  init: function(collectionName, numberToReturn, cursorId) {
    this.collectionName = collectionName;
    this.numberToReturn = numberToReturn;
    this.cursorId = cursorId;
    this.className = "GetMoreCommand";
  },
  
  getOpCode: function() {
    return mongo.BaseCommand.OP_GET_MORE;
  },
  
  getCommand: function() {
    // Generate the command string
    return mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.encode_utf8(this.collectionName) + mongo.BinaryParser.fromByte(0) + mongo.BinaryParser.fromInt(this.numberToReturn) + mongo.BSON.encodeLong(this.cursorId);
  }
})