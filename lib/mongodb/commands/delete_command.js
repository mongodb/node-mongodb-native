process.mixin(require('mongodb/commands/base_command'));
/**
  Insert Document Command
**/
exports.DeleteCommand = BaseCommand.extend({
  init: function(collectionName, selector) {
    this.collectionName = collectionName;
    this.selector = selector;
  },
  
  getOpCode: function() {
    return BaseCommand.OP_DELETE;
  },  
  
  /*
  struct {
      MsgHeader header;                 // standard message header
      int32     ZERO;                   // 0 - reserved for future use
      cstring   fullCollectionName;     // "dbname.collectionname"
      int32     ZERO;                   // 0 - reserved for future use
      BSON      selector;               // query object.  See below for details.
  }
  */
  getCommand: function() {
    // Generate the command string
    return BinaryParser.fromInt(0) + BinaryParser.encode_utf8(this.collectionName) + BinaryParser.fromByte(0) + BinaryParser.fromInt(0) + BSON.serialize(this.selector);
  }  
})
