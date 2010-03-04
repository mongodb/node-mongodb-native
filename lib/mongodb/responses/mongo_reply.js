var mongo = require('mongodb/goog/math/integer');
process.mixin(mongo, require('mongodb/goog/math/long'));
process.mixin(mongo, require('mongodb/bson/binary_parser'));
process.mixin(mongo, require('mongodb/bson/bson'));

/**
  Reply message from mongo db
**/
var MongoReply = exports.MongoReply = function(binary_reply) {
  this.documents = [];
  this.className = "MongoReply";
  var index = 0;
  // Unpack the standard header first
  var messageLength = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
  index = index + 4;
  // Fetch the request id for this reply
  this.requestId = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
  index = index + 4;
  // Fetch the id of the request that triggered the response
  this.responseTo = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
  // Skip op-code field
  index = index + 4 + 4;
  // Unpack the reply message
  this.responseFlag = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
  index = index + 4;
  // Unpack the cursor id (a 64 bit long integer)
  var low_bits = mongo.Integer.fromInt(mongo.BinaryParser.toInt(binary_reply.substr(index, 4)));
  var high_bits = mongo.Integer.fromInt(mongo.BinaryParser.toInt(binary_reply.substr(index + 4, 4)));
  this.cursorId = new mongo.Long(low_bits, high_bits);
  index = index + 8;
  // Unpack the starting from
  this.startingFrom = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
  index = index + 4;
  // Unpack the number of objects returned
  this.numberReturned = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
  index = index + 4;
  // Let's unpack all the bson document, deserialize them and store them
  for(var object_index = 0; object_index < this.numberReturned; object_index++) {
    // Read the size of the bson object
    var bsonObjectSize = mongo.BinaryParser.toInt(binary_reply.substr(index, 4));
    // Read the entire object and deserialize it
    this.documents.push(mongo.BSON.deserialize(binary_reply.substr(index, bsonObjectSize)));
    // Adjust for next object
    index = index + bsonObjectSize;
  }
};

MongoReply.prototype.is_error = function(){
  if(this.documents.length == 1) {
    return this.documents[0].ok == 1 ? false : true;
  }
  return false;
};

MongoReply.prototype.error_message = function() {
  return this.documents.length == 1 && this.documents[0].ok == 1 ? '' : this.documents[0].errmsg;
};