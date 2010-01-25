/**
  Insert Document Command
**/
KillCursorCommand = function(cursorIds) {
  this.cursorIds = cursorIds;
}

KillCursorCommand.prototype = new BaseCommand()
KillCursorCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_KILL_CURSORS;
}

/*
struct {
    MsgHeader header;                 // standard message header
    int32     ZERO;                   // 0 - reserved for future use
    int32     numberOfCursorIDs;      // number of cursorIDs in message
    int64[]   cursorIDs;                // array of cursorIDs to close
}
*/
KillCursorCommand.prototype.getCommand = function() {
  // Generate the command string
  var command_string = BinaryParser.fromInt(0) + BinaryParser.fromInt(this.cursorIds.length);
  for(var index in this.cursorIds) {
    command_string = command_string + this.bson.encodeLong(this.cursorIds[index]);
  }
  return command_string;
}