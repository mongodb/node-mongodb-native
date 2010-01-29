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
  this.position = 0;
}

GridStore.DEFAULT_ROOT_COLLECTION = 'fs';
GridStore.DEFAULT_CONTENT_TYPE = 'text/plain';

GridStore.IO_SEEK_SET = 0;
GridStore.IO_SEEK_CUR = 1;
GridStore.IO_SEEK_END = 2;

// Set basic prototype
GridStore.prototype = {
  get chunkSize() { return this.internalChunkSize; },
  set chunkSize(value) { 
    if(!(this.mode[0] == "w" && this.position == 0 && this.uploadDate == null)) {
      this.internalChunkSize = this.internalChunkSize;       
    } else {
      this.internalChunkSize = value;
    }
  },
  get md5() { return this.internalMd5; },
  set md5(value) {
    // md5 value cannot be set externally
  }
}

GridStore.prototype.open = function(callback) {
  var self = this;
  
  this.collection(function(collection) {
    collection.find(function(cursor) {
      cursor.nextObject(function(doc) {        
        // Chek if the collection for the files exists otherwise prepare the new one
        if(doc != null) {
          self.fileId = doc.get('_id');
          self.contentType = doc.get('contentType');
          self.internalChunkSize = doc.get('chunkSize');
          self.uploadDate = doc.get('uploadDate');
          self.aliases = doc.get('aliases');
          self.length = doc.get('length');
          self.metadata = doc.get('metadata');
          self.internalMd5 = doc.get('md5');
        } else {
          self.fileId = new ObjectID();
          self.contentType = GridStore.DEFAULT_CONTENT_TYPE;
          self.internalChunkSize = Chunk.DEFAULT_CHUNK_SIZE;
          self.length = 0;
        }        
        
        // Process the mode of the object
        if(self.mode == "r") {
          self.nthChunk(function(chunk) {
            self.currentChunk = chunk;
            self.position = 0;
            callback(self);
          }, 0);
        } else if(self.mode == "w") {
          self.chunkCollection(function(collection2) {
            // Create index for the chunks
            collection.createIndex(function(index) {
              // Delete any existing chunks
              self.deleteChunks(function(result) {
                self.currentChunk = new Chunk(self, new OrderedHash().add('n', 0));
                self.contentType = self.options['content_type'] == null ? self.contentType : self.options['content_type'];
                self.internalChunkSize = self.options['chunk_size'] == null ? self.internalChunkSize : self.options['chunk_size'];
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
                self.currentChunk = chunk == null ? new Chunk(self, new OrderedHash().add('n', 0)) : chunk;
                self.currentChunk.position = self.currentChunk.data.length();
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

GridStore.prototype.write = function(callback, string, close) {
  var self = this;
  var finalClose = close == null ? false : close;
  
  if(self.mode[0] != "w") {
    callback({ok:false, err:true, errmsg:(self.filename + " not opened for writing")});
  } else {
    if((self.currentChunk.position + string.length) > self.chunkSize) {
      var previousChunkNumber = self.currentChunk.chunkNumber;
      var leftOverDataSize = self.chunkSize - self.currentChunk.position;
      var previousChunkData = string.substr(0, leftOverDataSize);
      var leftOverData = string.substr(leftOverData, (string.length - leftOverDataSize));
      // Let's finish the current chunk and then call write again for the remaining data
      self.currentChunk.write(function(chunk) {
        chunk.save(function(result) {
          self.currentChunk = new Chunk(self, new OrderedHash().add('n', (previousChunkNumber + 1)));
          self.position = self.position + leftOverDataSize;        
          // Write the remaining data
          self.write(function(gridStore) {
            if(finalClose) {
              self.close(function(result) {
                callback(gridStore);
              });
            } else {
              callback(gridStore);
            }
          }, leftOverData);
        });              
      }, previousChunkData);
    } else {
      self.currentChunk.write(function(chunk) {
        self.position = self.position + string.length;
        if(finalClose) {
          self.close(function(result) {
            callback(self);
          });
        } else {
          callback(self);
        }          
      }, string);      
    }
  }
}

GridStore.prototype.buildMongoObject = function(callback) {
  var mongoObject = new OrderedHash();
  var length = this.currentChunk != null ? (this.currentChunk.chunkNumber * this.chunkSize + this.currentChunk.position - 1) : 0;
  mongoObject.add('_id', this.fileId)
    .add('filename', this.filename)
    .add('contentType', this.contentType)
    .add('length', length < 0 ? 0 : length)
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
    } else {
      self.collection(function(files) {
        self.uploadDate = new Date();
        self.buildMongoObject(function(mongoObject) {
          files.save(function(doc) {
            callback(doc);
          }, mongoObject);
        });          
      });
    }
  } else {
    callback({ok:false, err:true, errmsg:("Illegal mode " + self.mode)});
  }
}

GridStore.prototype.nthChunk = function(callback, chunkNumber) {
  var self = this;
  
  self.chunkCollection(function(collection) {
    collection.find(function(cursor) {
      cursor.nextObject(function(chunk) {        
        var finalChunk = chunk == null ? new OrderedHash() : chunk;
        callback(new Chunk(self, finalChunk));
      });
    }, {'files_id':self.fileId, 'n':chunkNumber});
  });
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

GridStore.exist = function(callback, db, name, rootCollection) {
  var rootCollectionFinal = rootCollection != null ? rootCollection : GridStore.DEFAULT_ROOT_COLLECTION;
  db.collection(function(collection) {
    collection.find(function(cursor) {
      cursor.nextObject(function(item) {
        callback(item == null ? false : true);
      });
    }, {'filename':name});
  }, rootCollectionFinal + ".files");
}

GridStore.list = function(callback, db, rootCollection) {
  var rootCollectionFinal = rootCollection != null ? rootCollection : GridStore.DEFAULT_ROOT_COLLECTION;
  var items = [];
  db.collection(function(collection) {
    collection.find(function(cursor) {
     cursor.each(function(item) {
       if(item != null) {
         items.push(item.get('filename'));
       } else {
         callback(items);
       }
     }); 
    });
  }, (rootCollectionFinal + ".files"));
}

GridStore.read = function(callback, db, name, length, offset) {
  var gridStore = new GridStore(db, name, "r");
  gridStore.open(function(gridStore) {    
    if(offset != null) {
      gridStore.seek(function(gridStore) {
        gridStore.read(function(data) {
          callback(data);
        }, length);        
      }, offset);
    } else {
      gridStore.read(function(data) {
        callback(data);
      }, length);
    }
  });
}

GridStore.readlines = function(callback, db, name, separator) {  
  var finalSeperator = separator == null ? "\n" : separator;
  var gridStore = new GridStore(db, name, "r");
  gridStore.open(function(gridStore) {    
    gridStore.readlines(function(lines) {
      callback(lines);
    }, finalSeperator);
  });
}

GridStore.prototype.readlines = function(callback, separator) {
  this.read(function(data) {
    var items = data.split(separator);
    items = items.length > 0 ? items.splice(0, items.length - 1) : [];
    for(var i = 0; i < items.length; i++) {
      items[i] = items[i] + separator;
    }
    callback(items);
  });
}

GridStore.unlink = function(callback, db, names) {
  var self = this;
  
  if(names.constructor == Array) {
    for(var i = 0; i < names.length; i++) {
      self.unlink(function(result) {
        if(i == (names.length - 1)) callback(self);
      }, db, names[i]);
    }
  } else {
    var gridStore = new GridStore(db, names, "r");
    gridStore.open(function(gridStore) { 
      gridStore.deleteChunks(function(result) {
        gridStore.collection(function(collection) {
          collection.remove(function(collection) {
            callback(self);
          }, {'_id':gridStore.fileId});
        });
      });
    });
  }
}

GridStore.prototype.rewind = function(callback) {
  var self = this;
  
  if(this.currentChunk.chunkNumber != 0) {
    if(this.mode[0] == "w") {
      self.deleteChunks(function(gridStore) {
        self.currentChunk = new Chunk(self, new OrderedHash().add('n', 0));
        self.position = 0;
        callback(self);
      });
    } else {
      self.currentChunk(function(chunk) {
        self.currentChunk = chunk;
        // self.currentChunk.position = 0;
        self.currentChunk.rewind();
        self.position = 0;        
        callback(self);
      }, 0);
    }
  } else {
    // self.currentChunk.position = 0;
    self.currentChunk.rewind();
    self.position = 0;    
    callback(self);
  }
}

GridStore.prototype.read = function(callback, length, buffer) {
  var self = this;
  
  // The data is a c-terminated string and thus the length - 1
  var finalBuffer = buffer == null ? '' : buffer;
  var finalLength = length == null ? self.length - self.position : length;
  var numberToRead = finalLength;

  if((self.currentChunk.length() - self.currentChunk.position + 1 + finalBuffer.length) >= finalLength) {
    finalBuffer = finalBuffer + self.currentChunk.read(finalLength - finalBuffer.length);
    numberToRead = numberToRead - finalLength;
    self.position = finalBuffer.length;
    callback(finalBuffer);
  } else {
    finalBuffer = finalBuffer + self.currentChunk.read(self.currentChunk.length());
    numberToRead = numberToRead - self.currentChunk.length();
    // Load the next chunk and read some more
    self.nthChunk(function(chunk) {
      self.currentChunk = chunk;
      self.read(callback, length, finalBuffer);
    }, self.currentChunk.chunkNumber + 1);
  }  
}

GridStore.prototype.tell = function(callback) {
  callback(this.position);
}

GridStore.prototype.seek = function(callback, position, seekLocation) {
  var self = this;  
  var seekLocationFinal = seekLocation == null ? GridStore.IO_SEEK_SET : seekLocation;
  // var finalPosition = position == 0 ? position : position - 1;
  var finalPosition = position;
  var targetPosition = 0;
  if(seekLocationFinal == GridStore.IO_SEEK_CUR) {
    targetPosition = self.position + finalPosition;
  } else if(seekLocationFinal == GridStore.IO_SEEK_END) {
    targetPosition = self.length + finalPosition;
  } else {
    targetPosition = finalPosition;
  }
  
  var newChunkNumber = Integer.fromNumber((targetPosition/self.chunkSize)).toInt();
  if(newChunkNumber != self.currentChunk.chunkNumber) {
    if(self.mode[0] == 'w') {
      self.currentChunk.save(function(chunk) {
        self.nthChunk(function(chunk) {
          self.currentChunk = chunk;
          self.position = targetPosition;
          self.currentChunk.position = (self.position % self.chunkSize);
          callback(self);
        }, newChunkNumber);
      });
    }
  } else {
    self.position = targetPosition;
    self.currentChunk.position = (self.position % self.chunkSize);
    callback(self);
  }
}

GridStore.prototype.eof = function() {
  return this.position == this.length ? true : false;
}

GridStore.prototype.getc = function(callback) {
  var self = this;
  
  if(self.eof()) {
    callback(null);
  } else if(self.currentChunk.eof()) {
    self.nthChunk(function(chunk) {
      self.currentChunk = chunk;
      self.position = self.position + 1;
      callback(self.currentChunk.getc());
    }, self.currentChunk.chunkNumber + 1);
  } else {
    self.position = self.position + 1;
    callback(self.currentChunk.getc());    
  }
}

GridStore.prototype.puts = function(callback, string) {
  var finalString = string.match(/\n$/) == null ? string + "\n" : string;
  this.write(callback, finalString);
}





















