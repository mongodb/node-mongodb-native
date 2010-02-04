process.mixin(require('mongodb/commands/base_command'));
/**
  Insert Document Command
**/
exports.InsertCommand = BaseCommand.extend({
  init: function(collectionName, checkKeys) {
    this.collectionName = collectionName;
    this.documents = [];
    this.checkKeys = checkKeys == null ? true : checkKeys;
  },
  
  add: function(document) {
    this.documents.push(document);
    return this;
  },
  
  getOpCode: function() {
    return BaseCommand.OP_INSERT;
  },
  
  /*
  struct {
      MsgHeader header;             // standard message header
      int32     ZERO;               // 0 - reserved for future use
      cstring   fullCollectionName; // "dbname.collectionname"
      BSON[]    documents;          // one or more documents to insert into the collection
  }
  */
  getCommand: function() {
    var command_string = '';
    for(var index in this.documents) {
      command_string = command_string + BSON.serialize(this.documents[index], this.checkKeys);
    }  
    // Build the command string 
    return BinaryParser.fromInt(0) + BinaryParser.encode_utf8(this.collectionName) + BinaryParser.fromByte(0) + command_string;
  }  
})