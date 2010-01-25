require("mongodb/bson/bson");
require("mongodb/bson/binary_parser");
require("mongodb/bson/collections");

sys = require("sys");

Chunk = function(file, mongoObject) {  
  this.file = file;
  var mongoObjectFinal = mongoObject == null ? new OrderedHash() : mongoObject;  
  this.objectId = mongoObjectFinal.get('_id') == null ? new ObjectID() : mongoObjectFinal.get('_id');
  this.chunkNumber = mongoObjectFinal.get('n') == null ? 0 : mongoObjectFinal.get('n');
  this.data = new Binary();
  
  if(mongoObjectFinal.get('data') == null) {
  } else if(mongoObjectFinal.get('data').constructor == String) {
    var dataArray = [];
    var string = mongoObjectFinal.get('data');
    for(var i = 0; i < string.length; i++) { dataArray.push(BinaryParser.fromByte(string.charCodeAt(i)));}
    this.data = new Binary(dataArray);
  } else if(mongoObjectFinal.get('data').constructor == Array) {
    this.data = new Binary(mongoObjectFinal.get('data'));
  } else if(mongoObjectFinal.get('data') instanceof Binary) {
    this.data = mongoObjectFinal.get('data');
  } else {
    throw Error("Illegal chunk format");    
  }
  // Update position
  this.position = 0;
}

Chunk.DEFAULT_CHUNK_SIZE = 1024 * 256;

// Set basic prototype
Chunk.prototype = new Object();
Chunk.prototype.write = function(callback, data) {
  this.data.write(data);
  this.position = this.data.length() + 1;
  callback(this);
}

Chunk.prototype.read = function(length) {
  if(this.length() - this.position + 1 >= length) {
    var data = this.data.read(this.position, length).join('');    
    this.position = this.position + length;
    return data;
  } else {
    return '';
  }
}

Chunk.prototype.eof = function() {
  return this.position == this.length() ? true : false;
}

Chunk.prototype.getc = function() {
  return this.read(1);
}

Chunk.prototype.rewind = function() {
  this.position = 0;
  this.data = new Binary();
}

Chunk.prototype.save = function(callback) {
  var self = this;
  
  self.file.chunkCollection(function(collection) {
    collection.remove(function(collection) {
      if(self.data.length() > 0) {
        self.buildMongoObject(function(mongoObject) {
          collection.insert(mongoObject, function(collection) {
            callback(self);
          }); 
        });        
      } else {
        callback(self);
      }
    }, {'_id':self.objectId});
  });
}
Chunk.prototype.buildMongoObject = function(callback) {
  var mongoObject = new OrderedHash();
  mongoObject.add('_id', this.objectId)
    .add('files_id', this.file.fileId)
    .add('n', this.chunkNumber)
    .add('data', this.data);
  callback(mongoObject);
}

Chunk.prototype.length = function() {
  return this.data.length();
}
