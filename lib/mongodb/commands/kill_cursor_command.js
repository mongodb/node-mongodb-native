var mongo = require('mongodb/bson/binary_parser');
process.mixin(mongo, require('mongodb/commands/base_command'));
process.mixin(mongo, require('mongodb/bson/bson'));
/**
  Insert Document Command
**/
exports.KillCursorCommand = mongo.BaseCommand.extend({
  init: function(cursorIds) {
    this.cursorIds = cursorIds;
    this.className = "KillCursorCommand";
  },
  
  getOpCode: function() {
    return mongo.BaseCommand.OP_KILL_CURSORS;
  },
  
  /*
  struct {
      MsgHeader header;                 // standard message header
      int32     ZERO;                   // 0 - reserved for future use
      int32     numberOfCursorIDs;      // number of cursorIDs in message
      int64[]   cursorIDs;                // array of cursorIDs to close
  }
  */
  getCommand: function() {
    // Generate the command string
    var command_string = mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.fromInt(this.cursorIds.length);
    this.cursorIds.forEach(function(cursorId) {
      command_string = command_string + mongo.BSON.encodeLong(cursorId);      
    })
    return command_string;
  }    
})
