// Reads in a C style string
var readCStyleStringSpecial = function(buffer, index) {
  // Get the start search index
  var i = index;
  // Locate the end of the c string
  while (buffer[i] !== 0x00 && i < buffer.length) {
    i++;
  }
  // If are at the end of the buffer there is a problem with the document
  if (i >= buffer.length) throw new Error('Bad BSON Document: illegal CString');
  // Grab utf8 encoded string
  var string = buffer.toString('utf8', index, i);
  // Update index position
  index = i + 1;
  // Return string
  return { s: string, i: index };
};

var Query = function(bson, data) {
  // The type of message
  this.type = 'op_query';
  // The number of documents
  this.documents = [];
  // Unpack the message
  var index = 0;
  // Message size
  this.size =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;
  // requestId
  this.requestId =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;
  // responseTo
  this.responseTo =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;
  // opCode
  this.opCode =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;

  // flags
  this.flags =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;

  // Read the full collection name
  var result = readCStyleStringSpecial(data, index);
  this.ns = result.s;
  index = result.i;

  // numberToSkip
  this.numberToSkip =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;

  // numberToReturn
  this.numberToReturn =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  index = index + 4;

  // Read the document size
  var docSize =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);

  // Deserialize the document
  this.documents.push(bson.deserialize(data.slice(index, index + docSize)));
  index = index + docSize;

  // No field selection
  if (index === data.length) {
    return;
  }

  // Read the projection document size
  docSize =
    data[index] | (data[index + 1] << 8) | (data[index + 2] << 16) | (data[index + 3] << 24);
  this.projection = bson.deserialize(data.slice(index, index + docSize));
};

var GetMore = function() {};

var KillCursor = function() {};

var Insert = function() {};

var Update = function() {};

var Delete = function() {};

module.exports = {
  Query: Query,
  GetMore: GetMore,
  KillCursor: KillCursor,
  Insert: Insert,
  Update: Update,
  Delete: Delete
};
