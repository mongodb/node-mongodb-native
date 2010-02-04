process.mixin(require('mongodb/commands/base_command'));
sys = require("sys");

/**
  Update Document Command
**/
exports.UpdateCommand = BaseCommand.extend({
  init: function(collectionName, spec, document, options) {
    this.collectionName = collectionName;
    this.spec = spec;
    this.document = document;

    // Generate correct flags
    var db_upsert = 0;
    var db_multi_update = 0;
    db_upsert = options != null && options['upsert'] != null ? (options['upsert'] == true ? 1 : 0) : db_upsert;
    db_multi_update = options != null && options['multi'] != null ? (options['multi'] == true ? 1 : 0) : db_multi_update;

    // Flags
    this.flags = parseInt(db_multi_update + db_upsert, 2);
  },
  
  getOpCode: function() {
    return BaseCommand.OP_UPDATE;
  },
  
  /*
  struct {
      MsgHeader header;             // standard message header
      int32     ZERO;               // 0 - reserved for future use
      cstring   fullCollectionName; // "dbname.collectionname"
      int32     flags;              // bit vector. see below
      BSON      spec;               // the query to select the document
      BSON      document;           // the document data to update with or insert
  }
  */
  getCommand: function() {
    // Generate the command string
    var command_string = BinaryParser.fromInt(0) + BinaryParser.encode_utf8(this.collectionName) + BinaryParser.fromByte(0);
    return command_string + BinaryParser.fromInt(this.flags) + BSON.serialize(this.spec) + BSON.serialize(this.document, false);
  }  
})

// Constants
exports.UpdateCommand.DB_UPSERT = 0;
exports.UpdateCommand.DB_MULTI_UPDATE = 1;