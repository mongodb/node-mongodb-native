require("mongodb/bson/bson");
require("mongodb/bson/collections");

sys = require("sys");

Chunk = function(file, mongoObject) {  
  this.file = file;
  var mongoObjectFinal = mongoObject == null ? {} : mongoObject;
  this.objectId = mongoObjectFinal['_id'] == null ? new ObjectID() : mongoObjectFinal['_id'];
  this.chunkNumber = mongoObjectFinal['n'] == null ? 0 : mongoObjectFinal['n'];
  this.data = '';
  
  if(mongoObjectFinal['data'] == null) {
  } else if(mongoObjectFinal['data'].constructor == String) {
    this.data = mongoObjectFinal['data'];
  } else if(mongoObjectFinal['data'].constructor == Array) {
    this.data = mongoObjectFinal['data'].join('');
  } else {
    throw Error("Illegal chunk format");    
  }
  // Update position
  this.position = this.data.length;
}

Chunk.DEFAULT_CHUNK_SIZE = 1024 * 256;

// Set basic prototype
Chunk.prototype = new Object();
Chunk.prototype.write = function(callback, data) {
  this.data = this.data + data;
  this.position = this.data.length;
  callback(this);
}
Chunk.prototype.save = function(callback) {
  var self = this;
  
  self.file.chunkCollection(function(collection) {
    collection.remove(function(collection) {
      self.buildMongoObject(function(mongoObject) {
        collection.insert(mongoObject, function(collection) {
          callback(self);
        }); 
      });
    }, {'_id':self.objectId});
  });
}
Chunk.prototype.buildMongoObject = function(callback) {
  var mongoObject = new OrderedHash();
  mongoObject.add('_id', this.objectId)
    .add('files_id', this.file.filesId)
    .add('n', this.chunkNumber)
    .add('data', this.data);
  callback(mongoObject);
}
