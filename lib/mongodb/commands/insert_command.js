var mongo = require('mongodb/bson/binary_parser');
process.mixin(mongo, require('mongodb/commands/base_command'));
process.mixin(mongo, require('mongodb/bson/bson'));

/**
  Insert Document Command
**/
var InsertCommand = exports.InsertCommand = function(collectionName, checkKeys) {
  mongo.BaseCommand.call(this);

  this.collectionName = collectionName;
  this.documents = [];
  this.checkKeys = checkKeys == null ? true : checkKeys;
  this.className = "InsertCommand";
};

process.inherits(InsertCommand, mongo.BaseCommand);

InsertCommand.prototype.add = function(document) {
  this.documents.push(document);
  return this;
};

InsertCommand.prototype.getOpCode = function() {
  return mongo.BaseCommand.OP_INSERT;
};

/*
struct {
    MsgHeader header;             // standard message header
    int32     ZERO;               // 0 - reserved for future use
    cstring   fullCollectionName; // "dbname.collectionname"
    mongo.BSON[]    documents;          // one or more documents to insert into the collection
}
*/
InsertCommand.prototype.getCommand = function() {
  var command_string = '';
  for(var i = 0; i < this.documents.length; i++) {
    command_string = command_string + mongo.BSON.serialize(this.documents[i], this.checkKeys);
  }
  // Build the command string
  return mongo.BinaryParser.fromInt(0) + mongo.BinaryParser.encode_utf8(this.collectionName) + mongo.BinaryParser.fromByte(0) + command_string;
};