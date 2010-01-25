/**
  Get More Document Command
**/
GetMoreCommand = function(collectionName, numberToReturn, cursorId) {
  this.collectionName = collectionName;
  this.numberToReturn = numberToReturn;
  this.cursorId = cursorId;
}

GetMoreCommand.prototype = new BaseCommand()
GetMoreCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_GET_MORE;
}

/*
*/
GetMoreCommand.prototype.getCommand = function() {
  // Generate the command string
  return BinaryParser.fromInt(0) + BinaryParser.encode_utf8(this.collectionName) + BinaryParser.fromByte(0) + BinaryParser.fromInt(this.numberToReturn) + this.bson.encodeLong(this.cursorId);
}