var Long = require('../goog/math/long').Long,
  debug = require('util').debug,
  inspect = require('util').inspect;

/**
  Reply message from mongo db
**/
var MongoReply = exports.MongoReply = function(db, binary_reply) {
  this.documents = [];
  var index = 0;
  // Unpack the standard header first
  var messageLength = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  // Fetch the request id for this reply
  this.requestId = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  // Fetch the id of the request that triggered the response
  this.responseTo = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  // Skip op-code field
  index = index + 4 + 4;
  // Unpack the reply message
  this.responseFlag = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  // Unpack the cursor id (a 64 bit long integer)
  var low_bits = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  var high_bits = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  this.cursorId = new db.bson_deserializer.Long(low_bits, high_bits);
  // Unpack the starting from
  this.startingFrom = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  // Unpack the number of objects returned
  this.numberReturned = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
  index = index + 4;
  
  // Let's unpack all the bson document, deserialize them and store them
  for(var object_index = 0; object_index < this.numberReturned; object_index++) {
    // Read the size of the bson object    
    var bsonObjectSize = binary_reply[index] | binary_reply[index + 1] << 8 | binary_reply[index + 2] << 16 | binary_reply[index + 3] << 24;
    // Deserialize the object and add to the documents array
    this.documents.push(db.bson_deserializer.BSON.deserialize(binary_reply.slice(index, index + bsonObjectSize)));
    // Adjust binary index to point to next block of binary bson data
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