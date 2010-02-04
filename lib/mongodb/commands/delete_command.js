var mongo = require('mongodb/bson/binary_parser');
process.mixin(mongo, require('mongodb/commands/base_command'));
process.mixin(mongo, require('mongodb/bson/bson'));

/**
  Insert Document Command
**/
exports.DeleteCommand = mongo.BaseCommand.extend({
  init: function(collectionName, selector) {
    this.collectionName = collectionName;
    this.selector = selector;
  },
  
  getOpCode: function() {
    return mongo.BaseCommand.OP_DELETE;
  },  
  
  /*
  struct {
      MsgHeader header;                 // standard message header
      int32     ZERO;                   // 0 - reserved for future use
      cstring   fullCollectionName;     // "dbname.collectionname"
      int32     ZERO;                   // 0 - reserved for future use
      mongo.BSON      selector;               // query object.  See below for details.
  }
  */
  getCommand: function() {
    // Generate the command string
    return mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.encode_utf8(this.collectionName) + mongo.BinaryParser.fromByte(0) + mongo.BinaryParser.fromInt(0) + mongo.BSON.serialize(this.selector);
  }  
})
