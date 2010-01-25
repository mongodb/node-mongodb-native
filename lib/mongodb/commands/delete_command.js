/**
  Insert Document Command
**/
DeleteCommand = function(collectionName, selector) {
  this.collectionName = collectionName;
  this.selector = selector;
}

DeleteCommand.prototype = new BaseCommand()
DeleteCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_DELETE;
}

/*
struct {
    MsgHeader header;                 // standard message header
    int32     ZERO;                   // 0 - reserved for future use
    cstring   fullCollectionName;     // "dbname.collectionname"
    int32     ZERO;                   // 0 - reserved for future use
    BSON      selector;               // query object.  See below for details.
}
*/
DeleteCommand.prototype.getCommand = function() {
  // Generate the command string
  return BinaryParser.fromInt(0) + BinaryParser.encode_utf8(this.collectionName) + BinaryParser.fromByte(0) + BinaryParser.fromInt(0) + this.bson.serialize(this.selector);
}