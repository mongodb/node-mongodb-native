var mongo = require('mongodb/bson/bson');
process.mixin(mongo, require('mongodb/bson/collections'));
process.mixin(mongo, require('mongodb/bson/binary_parser'));

sys = require("sys");

exports.Chunk = Class({
  init: function(file, mongoObject) {  
    this.file = file;
    var mongoObjectFinal = mongoObject == null ? new mongo.OrderedHash() : mongoObject;  
    this.objectId = mongoObjectFinal._id == null ? new mongo.ObjectID() : mongoObjectFinal._id;
    this.chunkNumber = mongoObjectFinal.n == null ? 0 : mongoObjectFinal.n;
    this.data = new mongo.Binary();
    this.className = "Chunk";    

    if(mongoObjectFinal.data == null) {
    } else if(mongoObjectFinal.data.constructor == String) {
      var dataArray = [];
      var string = mongoObjectFinal.data;
      for(var i = 0; i < string.length; i++) { dataArray.push(mongo.BinaryParser.fromByte(string.charCodeAt(i)));}
      this.data = new mongo.Binary(dataArray);
    } else if(mongoObjectFinal.data.constructor == Array) {
      this.data = new mongo.Binary(mongoObjectFinal.data);
    } else if(mongoObjectFinal.data.className == "Binary") {
      this.data = mongoObjectFinal.data;
    } else {
      throw Error("Illegal chunk format");    
    }
    // Update position
    this.internalPosition = 0;
    // Getters and Setters
    this.__defineGetter__("position", function() { return this.internalPosition; });
    this.__defineSetter__("position", function(value) { this.internalPosition = value; });      
  },
  
  write: function(data, callback) {
    this.data.write(data, this.internalPosition);
    this.internalPosition = this.data.length() + 1;
    callback(null, this);
  },
  
  read: function(length) {
    if(this.length() - this.internalPosition + 1 >= length) {
      var data = this.data.read(this.internalPosition, length).join('');    
      this.internalPosition = this.internalPosition + length;
      return data;
    } else {
      return '';
    }
  },
  
  eof: function() {
    return this.internalPosition == this.length() ? true : false;
  },
  
  getc: function() {
    return this.read(1);
  },
  
  rewind: function() {
    this.internalPeosition = 0;
    this.data = new mongo.Binary();
  },
  
  save: function(callback) {
    var self = this;

    self.file.chunkCollection(function(err, collection) {
      collection.remove({'_id':self.objectId}, function(err, collection) {
        if(self.data.length() > 0) {
          self.buildMongoObject(function(mongoObject) {
            collection.insert(mongoObject, function(collection) {
              callback(null, self);
            }); 
          });        
        } else {
          callback(null, self);
        }
      });
    });
  },
  
  buildMongoObject: function(callback) {
    var mongoObject = {'_id': this.objectId,
      'files_id': this.file.fileId,
      'n': this.chunkNumber,
      'data': this.data};    
    callback(mongoObject);
  },
  
  length: function() {
    return this.data.length();
  }
})
exports.Chunk.DEFAULT_CHUNK_SIZE = 1024 * 256;