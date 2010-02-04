process.mixin(require('mongodb/commands/base_command'));
/**
  Get More Document Command
**/
exports.GetMoreCommand = BaseCommand.extend({
  init: function(collectionName, numberToReturn, cursorId) {
    this.collectionName = collectionName;
    this.numberToReturn = numberToReturn;
    this.cursorId = cursorId;
  },
  
  getOpCode: function() {
    return BaseCommand.OP_GET_MORE;
  },
  
  getCommand: function() {
    // Generate the command string
    return BinaryParser.fromInt(0) + BinaryParser.encode_utf8(this.collectionName) + BinaryParser.fromByte(0) + BinaryParser.fromInt(this.numberToReturn) + BSON.encodeLong(this.cursorId);
  }
})