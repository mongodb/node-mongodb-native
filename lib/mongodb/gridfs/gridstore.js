sys = require("sys");

require("mongodb/bson/bson");
require("mongodb/bson/collections");
require("mongodb/gridfs/chunk");
require("mongodb/commands/db_command");

GridStore = function(db, filename, mode, options) {  
  this.db = db;
  this.filename = filename;
  this.mode = mode == null ? "r" : mode;
  this.options = options == null ? {} : options;
  this.root = this.options['root'] == null ? GridStore.DEFAULT_ROOT_COLLECTION : this.options['root'];  
}

GridStore.DEFAULT_ROOT_COLLECTION = 'fs';
GridStore.DEFAULT_CONTENT_TYPE = 'text/plain';

// Set basic prototype
GridStore.prototype = new Object();
GridStore.prototype.open = function(callback) {
  var self = this;
  
  this.collection(function(collection) {
    collection.find(function(cursor) {
      cursor.nextObject(function(doc) {
        self.lineno = 0
        self.pushbackByte = null;
        
        // Chek if the collection for the files exists otherwise prepare the new one
        if(doc != null) {
          sys.puts("========================================= 0");
          self.fileId = doc.get('_id');
          self.contentType = doc.get('contentType');
          self.chunkSize = doc.get('chunkSize');
          self.uploadDate = doc.get('uploadDate');
          self.aliases = doc.get('aliases');
          self.length = doc.get('length');
          self.metadata = doc.get('metadata');
          self.md5 = doc.get('md5');
        } else {
          sys.puts("========================================= 1");
          
          self.fileId = new ObjectID();
          self.contentType = GridStore.DEFAULT_CONTENT_TYPE;
          self.chunkSize = Chunk.DEFAULT_CHUNK_SIZE;
          self.length = 0;
        }        
        
        // Process the mode of the object
        if(self.mode == "r") {
          self.currentChunk = self.nthChunk(0);
          self.position = 0;
          callback(self);
        } else if(self.mode == "w") {
          self.chunkCollection(function(collection2) {
            // Create index for the chunks
            collection.createIndex(function(index) {
              // Delete any existing chunks
              self.deleteChunks(function(result) {
                self.currentChunk = new Chunk(self, {'n':0});
                self.contentType = self.options['content_type'] == null ? self.contentType : self.options['content_type'];
                self.chunkSize = self.options['chunk_size'] == null ? self.chunkSize : self.options['chunk_size'];
                self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
                self.position = 0;
                callback(self);
              });
            }, [['files_id', 1], ['n', 1]]);
          });
        } else if(self.mode == "w+") {
          self.chunkCollection(function(collection) {
            // Create index for the chunks
            collection.createIndex(function(index) {
              self.nthChunk(function(chunk) {
                // Set the current chunk
                self.currentChunk = chunk == null ? new Chunk(self, {'n':0}) : chunk;
                self.currentChunk.position = self.currentChunk.data.length;
                self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
                self.position = self.length;
                callback(self);
              }, self.lastChunkNumber);
            }, [['files_id', 1], ['n', 1]])
          });          
        } else {
          callback({ok:false, err:true, errmsg:("Illegal mode " + self.mode)});
        }
      });
    }, {'filename':self.filename});      
  })  
}

GridStore.prototype.write = function(callback, string) {
  var self = this;
  
  // sys.puts("==================================================== " + string);
  
  if(self.mode[0] != "w") {
    callback({ok:false, err:true, errmsg:(self.filename + " not opened for writing")});
  } else {
    // split the string into pieces if we need to create more than one chunk
    // sys.puts("- self.currentChunk.pos = " + self.currentChunk.position);
    // sys.puts("- string.length = " + string.length);
    // sys.puts("- self.chunkSize = " + self.chunkSize);
    
    if((self.currentChunk.position + string.length) >= self.chunkSize) {
      var previousChunkNumber = self.currentChunk.chunkNumber;
      var leftOverDataSize = self.chunkSize - self.currentChunk.position;
      var previousChunkData = string.substr(0, leftOverDataSize);
      var leftOverData = string.substr(leftOverData, (string.length - leftOverDataSize));
      // Let's finish the current chunk and then call write again for the remaining data
      self.currentChunk.write(function(chunk) {
        chunk.save(function(result) {
          self.currentChunk = new Chunk(self, {'n':(previousChunkNumber + 1)});
          self.position = this.position + leftOverDataSize;        
          // Write the remaining data
          self.write(callback, leftOverData);
        });              
      }, previousChunkData);
    } else {
      self.currentChunk.write(function(chunk) {
        // sys.puts("==================================================== 1.2");
        self.position = this.position + string.length;
        callback(self);
      }, string);      
    }
  }
}

GridStore.prototype.buildMongoObject = function(callback) {
  var mongoObject = new OrderedHash();
  mongoObject.add('_id', this.fileId)
    .add('filename', this.filename)
    .add('contentType', this.contentType)
    .add('length', this.currentChunk != null ? (this.currentChunk.chunkNumber * this.chunkSize * this.currentChunk.position) : 0)
    .add('chunkSize', this.chunkSize)
    .add('uploadDate', this.uploadDate)
    .add('aliases', this.aliases)
    .add('metadata', this.metadata);
    
  var md5Command = new OrderedHash();
  md5Command.add('filemd5', this.fileId)
    .add('root', this.root);

  this.db.command(function(results) {
    mongoObject.add('md5', results.get('md5'));
    callback(mongoObject);
  }, md5Command);
}

GridStore.prototype.close = function(callback) {
  var self = this;
  
  if(self.mode[0] == "w") {
    if(self.currentChunk != null && self.currentChunk.position > 0) {
      self.currentChunk.save(function(chuck) {
        self.collection(function(files) {
          // Build the mongo object
          if(self.uploadDate != null) {
            files.remove(function(collection) {
              self.buildMongoObject(function(mongoObject) {
                files.save(function(doc) {
                  callback(doc);
                }, mongoObject);
              });          
            }, {'_id':self.fileId});
          } else {
            self.uploadDate = new Date();
            self.buildMongoObject(function(mongoObject) {
              files.save(function(doc) {
                callback(doc);
              }, mongoObject);
            });          
          }            
        });
      });
    }
  }
}

GridStore.prototype.lastChunkNumber = function() {
  return Integer.fromNumber((self.length/self.chunkSize)).toInt();
}

GridStore.prototype.chunkCollection = function(callback) {
  this.db.collection(callback, (this.root + ".chunks"));
}

GridStore.prototype.deleteChunks = function(callback) {
  var self = this;
  
  if(self.fileId != null) {
    self.chunkCollection(function(collection) {
      collection.remove(function(result) {
        callback({ok:true, err:false, errmsg:null});        
      }, {'files_id':self.fileId});
    });
  } else {
    callback({ok:true, err:false, errmsg:null});
  }
}

GridStore.prototype.collection = function(callback) {
  this.db.collection(function(collection) {
    callback(collection);
  }, this.root + ".files");
}


