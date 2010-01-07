/**
  Insert Document Command
**/
InsertCommand = function(collectionName) {
  this.collectionName = collectionName;
  this.documents = [];
}

InsertCommand.prototype = new BaseCommand();
InsertCommand.prototype.add = function(document) {
  this.documents.push(document);
}

InsertCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_INSERT;
}

/*
struct {
    MsgHeader header;             // standard message header
    int32     ZERO;               // 0 - reserved for future use
    cstring   fullCollectionName; // "dbname.collectionname"
    BSON[]    documents;          // one or more documents to insert into the collection
}
*/
InsertCommand.prototype.getCommand = function() {
  var command_string = '';
  for(var index in this.documents) {
    command_string = command_string + this.bson.serialize(this.documents[index]);
  }  
  // Build the command string 
  return this.parser.fromInt(0) + this.parser.encode_utf8(this.collectionName) + this.parser.fromByte(0) + command_string;
}