/**
  Insert Document Command
**/
QueryCommand = function(collectionName, queryOptions, numberToSkip, numberToReturn, query, returnFieldSelector) {
  this.collectionName = collectionName;
  this.queryOptions = queryOptions;
  this.numberToSkip = numberToSkip;
  this.numberToReturn = numberToReturn;
  this.query = query;
  this.returnFieldSelector = returnFieldSelector;
}

// Constants
QueryCommand.OPTS_NONE = 0;
QueryCommand.OPTS_TAILABLE_CURSOR = 2;
QueryCommand.OPTS_SLAVE = 4;
QueryCommand.OPTS_OPLOG_REPLY = 8;
QueryCommand.OPTS_NO_CURSOR_TIMEOUT = 16;

QueryCommand.prototype = new BaseCommand();
QueryCommand.prototype.getOpCode = function() {
  return BaseCommand.OP_QUERY;
}

/*
struct {
    MsgHeader header;                 // standard message header
    int32     opts;                   // query options.  See below for details.
    cstring   fullCollectionName;     // "dbname.collectionname"
    int32     numberToSkip;           // number of documents to skip when returning results
    int32     numberToReturn;         // number of documents to return in the first OP_REPLY
    BSON      query ;                 // query object.  See below for details.
  [ BSON      returnFieldSelector; ]  // OPTIONAL : selector indicating the fields to return.  See below for details.
}
*/
QueryCommand.prototype.getCommand = function() {
  // Generate the command string
  var command_string = this.parser.fromInt(this.queryOptions) + this.parser.encode_utf8(this.collectionName) + this.parser.fromByte(0);
  command_string = command_string + this.parser.fromInt(this.numberToSkip) + this.parser.fromInt(this.numberToReturn);
  command_string = command_string + this.bson.serialize(this.query);
  if(this.returnFieldSelector != null) command_string = command_string + this.bson.serialize(this.returnFieldSelector);
  return command_string;
}