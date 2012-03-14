/**
 * @fileOverview GridFS is a tool for MongoDB to store files to the database.
 * Because of the restrictions of the object size the database can hold, a
 * facility to split a file into several chunks is needed. The {@link GridStore}
 * class offers a simplified api to interact with files while managing the
 * chunks of split files behind the scenes. More information about GridFS can be
 * found <a href="http://www.mongodb.org/display/DOCS/GridFS">here</a>.
 */
var Chunk = require('./chunk').Chunk,
  DbCommand = require('../commands/db_command').DbCommand,
  ObjectID = require('bson').ObjectID,
  Buffer = require('buffer').Buffer,
  fs = require('fs'),
  util = require('util'),
  ReadStream = require('./readstream').ReadStream;

var REFERENCE_BY_FILENAME = 0,
  REFERENCE_BY_ID = 1;

/**
 * A class representation of a file stored in GridFS.
 *
 * Modes
 *  - **"r"** - read only. This is the default mode.
 *  - **"w"** - write in truncate mode. Existing data will be overwriten.
 *  - **w+"** - write in edit mode.
 *
 * Options
 *  - **root** {String}, root collection to use. Defaults to **{GridStore.DEFAULT_ROOT_COLLECTION}**.
 *  - **chunk_type** {String}, mime type of the file. Defaults to **{GridStore.DEFAULT_CONTENT_TYPE}**.
 *  - **chunk_size** {Number}, size for the chunk. Defaults to **{Chunk.DEFAULT_CHUNK_SIZE}**.
 *  - **metadata** {Object}, arbitrary data the user wants to store.
 *
 * @class Represents the GridStore.
 * @param {Db} db A database instance to interact with.
 * @param {ObjectID} id an unique ObjectID for this file
 * @param {String} [filename] optional a filename for this file, no unique constrain on the field
 * @param {String} mode set the mode for this file.
 * @param {Object} options optional properties to specify. Recognized keys:
 * @return {GridStore}
 */
function GridStore(db, id, filename, mode, options) {
  if(!(this instanceof GridStore)) return new GridStore(db, id, filename, mode, options);

  var self = this;
  this.db = db;  
  var _filename = filename;

  if(typeof filename == 'string' && typeof mode == 'string') {
    _filename = filename;  
  } else if(typeof filename == 'string' && typeof mode == 'object' && mode != null) {
    var _mode = mode;
    mode = filename;
    options = _mode;    
    _filename = id;
  } else if(typeof filename == 'string' && mode == null) {
    mode = filename;
    _filename = id;
  }
  
  // set grid referencetype
  this.referenceBy = typeof id == 'string' ? 0 : 1;
  this.filename = _filename;
  this.fileId = id;
  
  // Set up the rest
  this.mode = mode == null ? "r" : mode;
  this.options = options == null ? {} : options;
  this.root = this.options['root'] == null ? exports.GridStore.DEFAULT_ROOT_COLLECTION : this.options['root'];
  this.position = 0;
  // Set default chunk size
  this.internalChunkSize = this.options['chunkSize'] == null ? Chunk.DEFAULT_CHUNK_SIZE : this.options['chunkSize'];  

  /**
   * Returns the current chunksize of the file.
   * 
   * @field chunkSize
   * @type {Number}
   * @getter
   * @setter
   * @property return number of bytes in the current chunkSize.
   */
  Object.defineProperty(this, "chunkSize", { enumerable: true
   , get: function () {
       return this.internalChunkSize;
     }
   , set: function(value) {
       if(!(this.mode[0] == "w" && this.position == 0 && this.uploadDate == null)) {
         this.internalChunkSize = this.internalChunkSize;
       } else {
         this.internalChunkSize = value;
       }
     }
  });  

  /**
   * The md5 checksum for this file.
   * 
   * @field md5
   * @type {Number}
   * @getter
   * @setter
   * @property return this files md5 checksum.
   */
  Object.defineProperty(this, "md5", { enumerable: true
   , get: function () {
       return this.internalMd5;
     }
  });  
};

/**
 * Opens the file from the database and initialize this object. Also creates a
 * new one if file does not exist.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain an **{Error}** object and the second parameter will be null if an error occured. Otherwise, the first parameter will be null and the second will contain the reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.open = function(callback) {
  if( this.mode != "w" && this.mode != "w+" && this.mode != "r"){
    callback(new Error("Illegal mode " + this.mode), null);
    return;
  }

  var self = this;
  
  if((self.mode == "w" || self.mode == "w+") && self.db.serverConfig.primary != null) {
    // Get files collection
    self.collection(function(err, collection) {
      // Get chunk collection
      self.chunkCollection(function(err, chunkCollection) {
        // Ensure index on chunk collection
        chunkCollection.ensureIndex([['files_id', 1], ['n', 1]], function(err, index) {
          _open(self, callback);
        });
      });
    });
  } else {
    _open(self, callback);
  }  
}

/**
 * Hidding the _open function 
 * @ignore
 * @api private
 */
var _open = function(self, callback) {
  self.collection(function(err, collection) {
    if(err!==null) {
      callback(new Error("at collection: "+err), null);
      return;
    }
    
    // Create the query
    var query = self.referenceBy == REFERENCE_BY_ID ? {_id:self.fileId} : {filename:self.filename};
    query = self.fileId == null && this.filename == null ? null : query;

    // Fetch the chunks
    if(query != null) {
      collection.find(query, function(err, cursor) {
        // Fetch the file
        cursor.nextObject(function(err, doc) {
          // Chek if the collection for the files exists otherwise prepare the new one
          if(doc != null) {              
            self.fileId = doc._id;
            self.contentType = doc.contentType;
            self.internalChunkSize = doc.chunkSize;
            self.uploadDate = doc.uploadDate;
            self.aliases = doc.aliases;
            self.length = doc.length;
            self.metadata = doc.metadata;
            self.internalMd5 = doc.md5;
          } else {
            self.fileId = self.fileId instanceof ObjectID ? self.fileId : new ObjectID();
            self.contentType = exports.GridStore.DEFAULT_CONTENT_TYPE;
            self.internalChunkSize = self.internalChunkSize == null ? Chunk.DEFAULT_CHUNK_SIZE : self.internalChunkSize;
            self.length = 0;
          }

          // Process the mode of the object
          if(self.mode == "r") {
            nthChunk(self, 0, function(err, chunk) {
              self.currentChunk = chunk;
              self.position = 0;
              callback(null, self);
            });
          } else if(self.mode == "w") {
            // Delete any existing chunks
            deleteChunks(self, function(err, result) {
              self.currentChunk = new Chunk(self, {'n':0});
              self.contentType = self.options['content_type'] == null ? self.contentType : self.options['content_type'];
              self.internalChunkSize = self.options['chunk_size'] == null ? self.internalChunkSize : self.options['chunk_size'];
              self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
              self.position = 0;
              callback(null, self);
            });
          } else if(self.mode == "w+") {
            nthChunk(self, lastChunkNumber(self), function(err, chunk) {
              // Set the current chunk
              self.currentChunk = chunk == null ? new Chunk(self, {'n':0}) : chunk;
              self.currentChunk.position = self.currentChunk.data.length();
              self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
              self.position = self.length;
              callback(null, self);
            });                
          }
        });
      });              
    } else {
      // Write only mode
      self.fileId = new ObjectID();
      self.contentType = exports.GridStore.DEFAULT_CONTENT_TYPE;
      self.internalChunkSize = self.internalChunkSize == null ? Chunk.DEFAULT_CHUNK_SIZE : self.internalChunkSize;
      self.length = 0;        
      
      self.chunkCollection(function(err, collection2) {
        // No file exists set up write mode
        if(self.mode == "w") {
          // Delete any existing chunks
          deleteChunks(self, function(err, result) {
            self.currentChunk = new Chunk(self, {'n':0});
            self.contentType = self.options['content_type'] == null ? self.contentType : self.options['content_type'];
            self.internalChunkSize = self.options['chunk_size'] == null ? self.internalChunkSize : self.options['chunk_size'];
            self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
            self.position = 0;
            callback(null, self);
          });
        } else if(self.mode == "w+") {
          nthChunk(self, lastChunkNumber(self), function(err, chunk) {
            // Set the current chunk
            self.currentChunk = chunk == null ? new Chunk(self, {'n':0}) : chunk;
            self.currentChunk.position = self.currentChunk.data.length();
            self.metadata = self.options['metadata'] == null ? self.metadata : self.options['metadata'];
            self.position = self.length;
            callback(null, self);
          });
        }            
      });
    };
  });
};

/**
 * Stores a file from the file system to the GridFS database.
 *
 * @param {String|Buffer|FileHandle} file the file to store.
 * @param {Function} callback this will be called after this method is executed. The first parameter will be null and the the second will contain the reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.writeFile = function (file, callback) {
  var self = this;
  if (typeof file === 'string') {
    fs.open(file, 'r', 0666, function (err, fd) {
      // TODO Handle err
      self.writeFile(fd, callback);
    });
    return;
  }

  self.open(function (err, self) {
    fs.fstat(file, function (err, stats) {
      var offset = 0;
      var index = 0;
      var numberOfChunksLeft = Math.min(stats.size / self.chunkSize);
      
      // Write a chunk
      var writeChunk = function() {
        fs.read(file, self.chunkSize, offset, 'binary', function(err, data, bytesRead) {
          offset = offset + bytesRead;
          // Create a new chunk for the data
          var chunk = new Chunk(self, {n:index++});
          chunk.write(data, function(err, chunk) {
            chunk.save(function(err, result) {
              // Point to current chunk
              self.currentChunk = chunk;
              
              if(offset >= stats.size) {
                fs.close(file);
                self.close(function(err, result) {
                  return callback(null, result);                  
                })                 
              } else {
                return process.nextTick(writeChunk);
              }
            });
          });
        });
      }
      
      // Process the first write
      process.nextTick(writeChunk);
    });
  });
};

/**
 * Writes some data. This method will work properly only if initialized with mode "w" or "w+".
 *
 * @param {String|Buffer} data the data to write.
 * @param {Boolean} [close] closes this file after writing if set to true.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.write = function(data, close, callback) { 
  // If we have a buffer write it using the writeBuffer method
  if(Buffer.isBuffer(data)) return writeBuffer(this, data, close, callback);
  // Otherwise check for the callback
  if(typeof close === "function") { callback = close; close = null; }
  var self = this;
  var finalClose = close == null ? false : close;
  // Otherwise let's write the data
  if(self.mode[0] != "w") {
    callback(new Error((self.referenceBy == REFERENCE_BY_ID ? self.toHexString() : self.filename) + " not opened for writing"), null);
  } else {
    if((self.currentChunk.position + data.length) > self.chunkSize) {            
      var previousChunkNumber = self.currentChunk.chunkNumber;
      var leftOverDataSize = self.chunkSize - self.currentChunk.position;
      var previousChunkData = data.slice(0, leftOverDataSize);
      var leftOverData = data.slice(leftOverDataSize, (data.length - leftOverDataSize));
      // Save out current Chunk as another variable and assign a new Chunk for overflow data
      var saveChunk = self.currentChunk;
      // Create a new chunk at once (avoid wrong writing of chunks)
      self.currentChunk = new Chunk(self, {'n': (previousChunkNumber + 1)});      

      // Let's finish the current chunk and then call write again for the remaining data
      saveChunk.write(previousChunkData, function(err, chunk) {
        chunk.save(function(err, result) {
          self.position = self.position + leftOverDataSize;
          // Write the remaining data
          self.write(leftOverData, function(err, gridStore) {
            if(finalClose) {
              self.close(function(err, result) {
                callback(null, gridStore);
              });
            } else {
              callback(null, gridStore);
            }
          });
        });
      });
    } else {
      self.currentChunk.write(data, function(err, chunk) {
        self.position = self.position + data.length;
        if(finalClose) {
          self.close(function(err, result) {
            callback(null, self);
          });
        } else {
          callback(null, self);
        }
      });
    }
  }
};

/**
 * Writes some data. This method will work properly only if initialized with mode
 * "w" or "w+".
 *
 * @param string {string} The data to write.
 * @param close {boolean=false} opt_argument Closes this file after writing if
 *     true.
 * @param callback {function(*, GridStore)} This will be called after executing
 *     this method. The first parameter will contain null and the second one
 *     will contain a reference to this object.
 *
 * @ignore
 * @api private
 */
var writeBuffer = function(self, buffer, close, callback) {
	if(typeof close === "function") { callback = close; close = null; }
	var finalClose = (close == null) ? false : close;
	
	if(self.mode[0] != "w") {
		callback(new Error((self.referenceBy == REFERENCE_BY_ID ? self.toHexString() : self.filename) + " not opened for writing"), null);
	} else {
		if((self.currentChunk.position + buffer.length) > self.chunkSize) {
			// Data exceeds current chunk remaining free size; fill up current chunk and write the rest
			// to a new chunk (recursively)
			var previousChunkNumber = self.currentChunk.chunkNumber;
			var leftOverDataSize = self.chunkSize - self.currentChunk.position;
			var firstChunkData = buffer.slice(0, leftOverDataSize);			
			var leftOverData = buffer.slice(leftOverDataSize);
      // Save out current Chunk as another variable and assign a new Chunk for overflow data
      var saveChunk = self.currentChunk;
      // Create a new chunk at once (avoid wrong writing of chunks)
      self.currentChunk = new Chunk(self, {'n': (previousChunkNumber + 1)});
			
			// Let's finish the current chunk and then call write again for the remaining data
			saveChunk.write(firstChunkData, function(err, chunk) {
				chunk.save(function(err, result) {
					self.position = self.position + leftOverDataSize;
					
					// Write the remaining data
					writeBuffer(self, leftOverData, function(err, gridStore) {
						if(finalClose) {
							self.close(function(err, result) {
								callback(null, gridStore);
							});
						} 
						else {
							callback(null, gridStore);
						}
					});
				});
			});
		} 
		else {
			// Write buffer to chunk all at once
			self.currentChunk.write(buffer, function(err, chunk) {
				self.position = self.position + buffer.length;
				if(finalClose) {
					self.close(function(err, result) {
						callback(null, self);
					});
				} 
				else {
					callback(null, self);
				}
			});
		}
	}
};

/**
 * Creates a mongoDB object representation of this object.
 *
 * @param callback {function(object)} This will be called after executing this
 *     method. The object will be passed to the first parameter and will have
 *     the structure:
 *        
 *        <pre><code>
 *        {
 *          '_id' : , // {number} id for this file
 *          'filename' : , // {string} name for this file
 *          'contentType' : , // {string} mime type for this file
 *          'length' : , // {number} size of this file?
 *          'chunksize' : , // {number} chunk size used by this file
 *          'uploadDate' : , // {Date}
 *          'aliases' : , // {array of string}
 *          'metadata' : , // {string}
 *        }
 *        </code></pre>
 *
 * @ignore
 * @api private
 */
var buildMongoObject = function(self, callback) {
  var length = self.currentChunk != null ? (self.currentChunk.chunkNumber * self.chunkSize + self.currentChunk.position) : 0;
  var mongoObject = {
    '_id': self.fileId,
    'filename': self.filename,
    'contentType': self.contentType,
    'length': length < 0 ? 0 : length,
    'chunkSize': self.chunkSize,
    'uploadDate': self.uploadDate,
    'aliases': self.aliases,
    'metadata': self.metadata
  };

  var md5Command = {filemd5:self.fileId, root:self.root};
  self.db.command(md5Command, function(err, results) {
    mongoObject.md5 = results.md5;
    callback(mongoObject);
  });
};

/**
 * Saves this file to the database. This will overwrite the old entry if it
 * already exists. This will work properly only if mode was initialized to
 * "w" or "w+".
 *
 * @param {Function} callback this will be called after executing this method. Passes an **{Error}** object to the first parameter and null to the second if an error occured. Otherwise, passes null to the first and a reference to this object to the second.
 * @return {null}
 * @api public
 */
GridStore.prototype.close = function(callback) {
  var self = this;

  if(self.mode[0] == "w") {
    if(self.currentChunk != null && self.currentChunk.position > 0) {
      self.currentChunk.save(function(err, chuck) {
        self.collection(function(err, files) {
          // Build the mongo object
          if(self.uploadDate != null) {
            files.remove({'_id':self.fileId}, {safe:true}, function(err, collection) {
              buildMongoObject(self, function(mongoObject) {
                files.save(mongoObject, {safe:true}, function(err, doc) {
                  callback(err, mongoObject);
                });
              });
            });
          } else {
            self.uploadDate = new Date();
            buildMongoObject(self, function(mongoObject) {
              files.save(mongoObject, {safe:true}, function(err, doc) {
                callback(err, mongoObject);
              });
            });
          }
        });
      });
    } else {
      self.collection(function(err, files) {
        self.uploadDate = new Date();
        buildMongoObject(self, function(mongoObject) {
          files.save(mongoObject, {safe:true}, function(err, doc) {
            callback(err, mongoObject);
          });
        });
      });
    }
  } else if(self.mode[0] == "r") {
    callback(null, null);
  } else {
    callback(new Error("Illegal mode " + self.mode), null);
  }
};

/**
 * Gets the nth chunk of this file.
 *
 * @param chunkNumber {number} The nth chunk to retrieve.
 * @param callback {function(*, Chunk|object)} This will be called after
 *     executing this method. null will be passed to the first parameter while
 *     a new {@link Chunk} instance will be passed to the second parameter if
 *     the chunk was found or an empty object {} if not.
 *
 * @ignore
 * @api private
 */
var nthChunk = function(self, chunkNumber, callback) {
  self.chunkCollection(function(err, collection) {
    collection.find({'files_id':self.fileId, 'n':chunkNumber}, function(err, cursor) {
      cursor.nextObject(function(err, chunk) {
        var finalChunk = chunk == null ? {} : chunk;
        callback(null, new Chunk(self, finalChunk));
      });
    });
  });
};

/**
 *
 * @ignore
 * @api private
 */
GridStore.prototype._nthChunk = function(chunkNumber, callback) {
  nthChunk(this, chunkNumber, callback);
}

/**
 * @return {Number} The last chunk number of this file.
 *
 * @ignore
 * @api private
 */
var lastChunkNumber = function(self) {
  return Math.floor(self.length/self.chunkSize);
};

/**
 * Retrieve this file's chunks collection.
 *
 * @param {Function} callback this will be called after executing this method. An exception object will be passed to the first parameter when an error occured or null otherwise. A new **{Collection}** object will be passed to the second parameter if no error occured.
 * @return {null}
 * @api public
 */
GridStore.prototype.chunkCollection = function(callback) {
  this.db.collection((this.root + ".chunks"), callback);
};

/**
 * Deletes all the chunks of this file in the database.
 *
 * @param callback {function(*, boolean)} This will be called after this method
 *     executes. Passes null to the first and true to the second argument.
 *
 * @ignore
 * @api private
 */
var deleteChunks = function(self, callback) {
  if(self.fileId != null) {
    self.chunkCollection(function(err, collection) {
      if(err!==null) {
        callback(err, false);
      }
      collection.remove({'files_id':self.fileId}, {safe:true}, function(err, result) {
        callback(null, true);
      });
    });
  } else {
    callback(null, true);
  }
};

/**
 * Deletes all the chunks of this file in the database.
 *
 * @param {Function} callback this will be called after this method executes. Passes null to the first and true to the second argument.
 * @return {null}
 * @api public
 */
GridStore.prototype.unlink = function(callback) {
  var self = this;
  deleteChunks(this, function(err) {
    if(err!==null) {
      callback("at deleteChunks: "+err);
      return;
    }
  
    self.collection(function(err, collection) {
      if(err!==null) {
        callback("at collection: "+err);
        return;
      }
    
      collection.remove({'_id':self.fileId}, {safe:true}, function(err, collection) {
        callback(err, self);
      });
    });
  });
};

/**
 * Retrieves the file collection associated with this object.
 *
 * @param {Function} callback this will be called after executing this method. An exception object will be passed to the first parameter when an error occured or null otherwise. A new **{Collection}** object will be passed to the second parameter if no error occured.
 * @return {null}
 * @api public
 */
GridStore.prototype.collection = function(callback) {
  this.db.collection(this.root + ".files", function(err, collection) {
    callback(err, collection);
  });
};

/**
 * Reads the data of this file.
 *
 * @param {String} [separator] the character to be recognized as the newline separator.
 * @param {Function} callback This will be called after this method is executed. The first parameter will be null and the second parameter will contain an array of strings representing the entire data, each element representing a line including the separator character.
 * @return {null}
 * @api public
 */
GridStore.prototype.readlines = function(separator, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  separator = args.length ? args.shift() : "\n";

  this.read(function(err, data) {    
    var items = data.toString().split(separator);
    items = items.length > 0 ? items.splice(0, items.length - 1) : [];
    for(var i = 0; i < items.length; i++) {
      items[i] = items[i] + separator;
    }
    
    callback(null, items);
  });
};

/**
 * Deletes all the chunks of this file in the database if mode was set to "w" or
 * "w+" and resets the read/write head to the initial position.
 *
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.rewind = function(callback) {
  var self = this;

  if(this.currentChunk.chunkNumber != 0) {
    if(this.mode[0] == "w") {
      deleteChunks(self, function(err, gridStore) {
        self.currentChunk = new Chunk(self, {'n': 0});
        self.position = 0;
        callback(null, self);
      });
    } else {
      self.currentChunk(0, function(err, chunk) {
        self.currentChunk = chunk;
        self.currentChunk.rewind();
        self.position = 0;
        callback(null, self);
      });
    }
  } else {
    self.currentChunk.rewind();
    self.position = 0;
    callback(null, self);
  }
};

/**
 * Retrieves the contents of this file and advances the read/write head. Works with Buffers only.
 *
 * There are 3 signatures for this method:
 *
 * (callback)
 * (length, callback)
 * (length, buffer, callback)
 *
 * @param {Number} [length] the number of characters to read. Reads all the characters from the read/write head to the EOF if not specified.
 * @param {String|Buffer} [buffer] a string to hold temporary data. This is used for storing the string data read so far when recursively calling this method.
 * @param {Function} callback this will be called after this method is executed. null will be passed to the first parameter and a string containing the contents of the buffer concatenated with the contents read from this file will be passed to the second.
 * @return {null}
 * @api public
 */
GridStore.prototype.read = function(length, buffer, callback) {
  var self = this;

  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  length = args.length ? args.shift() : null;
  buffer = args.length ? args.shift() : null;

  // The data is a c-terminated string and thus the length - 1
  var finalLength = length == null ? self.length - self.position : length;
  var finalBuffer = buffer == null ? new Buffer(finalLength) : buffer;
  // Add a index to buffer to keep track of writing position or apply current index
  finalBuffer._index = buffer != null && buffer._index != null ? buffer._index : 0;

  if((self.currentChunk.length() - self.currentChunk.position + 1 + finalBuffer._index) >= finalLength) {
    var slice = self.currentChunk.readSlice(finalLength - finalBuffer._index);
    // Copy content to final buffer
    slice.copy(finalBuffer, finalBuffer._index);
    // Update internal position
    self.position = finalBuffer.length;
    // Check if we don't have a file at all
    if(finalLength == 0 && finalBuffer.length == 0) return callback(new Error("File does not exist"), null);
    // Else return data
    callback(null, finalBuffer);
  } else {
    var slice = self.currentChunk.readSlice(self.currentChunk.length());
    // Copy content to final buffer
    slice.copy(finalBuffer, finalBuffer._index);
    // Update index position
    finalBuffer._index += slice.length;

    // Load next chunk and read more    
    nthChunk(self, self.currentChunk.chunkNumber + 1, function(err, chunk) {
      if(chunk.length() > 0) {
        self.currentChunk = chunk;
        self.read(length, finalBuffer, callback);
      } else {
        finalBuffer._index > 0 ? callback(null, finalBuffer) : callback(new Error("no chunks found for file, possibly corrupt"), null);
      }
    });
  }
}

/**
 * Retrieves the position of the read/write head of this file.
 *
 * @param {Function} callback This gets called after this method terminates. null is passed to the first parameter and the position is passed to the second.
 * @return {null}
 * @api public
 */
GridStore.prototype.tell = function(callback) {
  callback(null, this.position);
};

/**
 * Moves the read/write head to a new location.
 *
 * There are 3 signatures for this method
 *
 * Seek Location Modes
 *  - **GridStore.IO_SEEK_SET**, **(default)** set the position from the start of the file.
 *  - **GridStore.IO_SEEK_CUR**, set the position from the current position in the file.
 *  - **GridStore.IO_SEEK_END**, set the position from the end of the file.
 *
 * @param {Number} [position] the position to seek to
 * @param {Number} [seekLocation] seek mode. Use one of the Seek Location modes.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.seek = function(position, seekLocation, callback) {
  var self = this;

  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  seekLocation = args.length ? args.shift() : null;

  var seekLocationFinal = seekLocation == null ? exports.GridStore.IO_SEEK_SET : seekLocation;
  var finalPosition = position;
  var targetPosition = 0;
  if(seekLocationFinal == exports.GridStore.IO_SEEK_CUR) {
    targetPosition = self.position + finalPosition;
  } else if(seekLocationFinal == exports.GridStore.IO_SEEK_END) {
    targetPosition = self.length + finalPosition;
  } else {
    targetPosition = finalPosition;
  }

  var newChunkNumber = Math.floor(targetPosition/self.chunkSize);
  if(newChunkNumber != self.currentChunk.chunkNumber) {
    var seekChunk = function() {
      nthChunk(self, newChunkNumber, function(err, chunk) {
        self.currentChunk = chunk;
        self.position = targetPosition;
        self.currentChunk.position = (self.position % self.chunkSize);
        callback(null, self);
      });
    };

    if(self.mode[0] == 'w') {
      self.currentChunk.save(function(err, chunk) {
        seekChunk();
      });
    } else {
      seekChunk();
    }
  } else {
    self.position = targetPosition;
    self.currentChunk.position = (self.position % self.chunkSize);
    callback(null, self);
  }
};

/**
 * Verify if the file is at EOF.
 *
 * @return {Boolean} true if the read/write head is at the end of this file.
 * @api public
 */
GridStore.prototype.eof = function() {
  return this.position == this.length ? true : false;
};

/**
 * Retrieves a single character from this file.
 *
 * @param {Function} callback this gets called after this method is executed. Passes null to the first parameter and the character read to the second or null to the second if the read/write head is at the end of the file.
 * @return {null}
 * @api public
 */
GridStore.prototype.getc = function(callback) {
  var self = this;

  if(self.eof()) {
    callback(null, null);
  } else if(self.currentChunk.eof()) {
    nthChunk(self, self.currentChunk.chunkNumber + 1, function(err, chunk) {
      self.currentChunk = chunk;
      self.position = self.position + 1;
      callback(null, self.currentChunk.getc());
    });
  } else {
    self.position = self.position + 1;
    callback(null, self.currentChunk.getc());
  }
};

/**
 * Writes a string to the file with a newline character appended at the end if
 * the given string does not have one.
 *
 * @param {String} string the string to write.
 * @param {Function} callback this will be called after executing this method. The first parameter will contain null and the second one will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.prototype.puts = function(string, callback) {
  var finalString = string.match(/\n$/) == null ? string + "\n" : string;
  this.write(finalString, callback);
};

/**
 * Returns read stream based on this GridStore file
 *
 * Events
 *  - **data** {function(item) {}} the data event triggers when a document is ready.
 *  - **end** {function() {}} the end event triggers when there is no more documents available.
 *  - **close** {function() {}} the close event triggers when the stream is closed.
 *  - **error** {function(err) {}} the error event triggers if an error happens.
 *
 * @param {Boolean} autoclose if true current GridStore will be closed when EOF and 'close' event will be fired
 * @return {null}
 * @api public
 */
GridStore.prototype.stream = function(autoclose) {
  return new ReadStream(autoclose, this);
};

/**
* The collection to be used for holding the files and chunks collection.
*  
* @classconstant DEFAULT_ROOT_COLLECTION
**/
GridStore.DEFAULT_ROOT_COLLECTION = 'fs';

/**
* Default file mime type
*  
* @classconstant DEFAULT_CONTENT_TYPE
**/
GridStore.DEFAULT_CONTENT_TYPE = 'binary/octet-stream';

/**
* Seek mode where the given length is absolute.
*  
* @classconstant IO_SEEK_SET
**/
GridStore.IO_SEEK_SET = 0;

/**
* Seek mode where the given length is an offset to the current read/write head.
*  
* @classconstant IO_SEEK_CUR
**/
GridStore.IO_SEEK_CUR = 1;

/**
* Seek mode where the given length is an offset to the end of the file.
*  
* @classconstant IO_SEEK_END
**/
GridStore.IO_SEEK_END = 2;

/**
 * Checks if a file exists in the database.
 *
 * @param {Db} db the database to query.
 * @param {String} name the name of the file to look for.
 * @param {String} [rootCollection] the root collection that holds the files and chunks collection. Defaults to **{GridStore.DEFAULT_ROOT_COLLECTION}**.
 * @param {Function} callback this will be called after this method executes. Passes null to the first and passes true to the second if the file exists and false otherwise.
 * @return {null}
 * @api public
 */
GridStore.exist = function(db, fileIdObject, rootCollection, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  rootCollection = args.length ? args.shift() : null;

  // Fetch collection
  var rootCollectionFinal = rootCollection != null ? rootCollection : GridStore.DEFAULT_ROOT_COLLECTION;
  db.collection(rootCollectionFinal + ".files", function(err, collection) {
    // Build query
    var query = (typeof fileIdObject == 'string' || Object.prototype.toString.call(fileIdObject) == '[object RegExp]' )
      ? {'filename':fileIdObject} : {'_id':fileIdObject};    // Attempt to locate file
    collection.find(query, function(err, cursor) {
      cursor.nextObject(function(err, item) {
        callback(null, item == null ? false : true);
      });
    });
  });
};

/**
 * Gets the list of files stored in the GridFS.
 *
 * @param {Db} db the database to query.
 * @param {String} [rootCollection] the root collection that holds the files and chunks collection. Defaults to **{GridStore.DEFAULT_ROOT_COLLECTION}**.
 * @param {Function} callback this will be called after this method executes. Passes null to the first and passes an array of strings containing the names of the files.
 * @return {null}
 * @api public
 */
GridStore.list = function(db, rootCollection, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  rootCollection = args.length ? args.shift() : null;
  options = args.length ? args.shift() : {};

  // Ensure we have correct values
  if(rootCollection != null && typeof rootCollection == 'object') {
    options = rootCollection;
    rootCollection = null;
  }
  
  // Check if we are returning by id not filename
  var byId = options['id'] != null ? options['id'] : false;
  // Fetch item
  var rootCollectionFinal = rootCollection != null ? rootCollection : GridStore.DEFAULT_ROOT_COLLECTION;
  var items = [];
  db.collection((rootCollectionFinal + ".files"), function(err, collection) {
    collection.find(function(err, cursor) {
     cursor.each(function(err, item) {
       if(item != null) {
         items.push(byId ? item._id : item.filename);
       } else {
         callback(null, items);
       }
     });
    });
  });
};

/**
 * Reads the contents of a file.
 *
 * This method has the following signatures
 *
 * (db, name, callback)
 * (db, name, length, callback)
 * (db, name, length, offset, callback)
 * (db, name, length, offset, options, callback)
 *
 * @param {Db} db the database to query.
 * @param {String} name the name of the file.
 * @param {Number} [length] the size of data to read.
 * @param {Number} [offset] the offset from the head of the file of which to start reading from.
 * @param {Object} [options] the options for the file.
 * @param {Function} callback this will be called after this method executes. A string with an error message will be passed to the first parameter when the length and offset combination exceeds the length of the file while an Error object will be passed if other forms of error occured, otherwise, a string is passed. The second parameter will contain the data read if successful or null if an error occured.
 * @return {null}
 * @api public
 */
GridStore.read = function(db, name, length, offset, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  length = args.length ? args.shift() : null;
  offset = args.length ? args.shift() : null;
  options = args.length ? args.shift() : null;

  new GridStore(db, name, "r", options).open(function(err, gridStore) {
    // Make sure we are not reading out of bounds
    if(offset && offset >= gridStore.length) return callback("offset larger than size of file", null);
    if(length && length > gridStore.length) return callback("length is larger than the size of the file", null);
    if(offset && length && (offset + length) > gridStore.length) return callback("offset and length is larger than the size of the file", null);
    
    if(offset != null) {
      gridStore.seek(offset, function(err, gridStore) {
        gridStore.read(length, function(err, data) {
          callback(err, data);
        });
      });
    } else {
      gridStore.read(length, function(err, data) {
        callback(err, data);
      });
    }
  });
};

/**
 * Reads the data of this file.
 *
 * @param {Db} db the database to query.
 * @param {String} name the name of the file.
 * @param {String} [separator] the character to be recognized as the newline separator.
 * @param {Object} [options] file options.
 * @param {Function} callback this will be called after this method is executed. The first parameter will be null and the second parameter will contain an array of strings representing the entire data, each element representing a line including the separator character.
 * @return {null}
 * @api public
 */
GridStore.readlines = function(db, name, separator, options, callback) {
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  separator = args.length ? args.shift() : null;
  options = args.length ? args.shift() : null;

  var finalSeperator = separator == null ? "\n" : separator;
  new GridStore(db, name, "r", options).open(function(err, gridStore) {
    gridStore.readlines(finalSeperator, function(err, lines) {
      callback(err, lines);
    });
  });
};

/**
 * Deletes the chunks and metadata information of a file from GridFS.
 *
 * @param {Db} db the database to interact with.
 * @param {String|Array} names the name/names of the files to delete.
 * @param {Object} [options] the options for the files.
 * @callback {Function} this will be called after this method is executed. The first parameter will contain an Error object if an error occured or null otherwise. The second parameter will contain a reference to this object.
 * @return {null}
 * @api public
 */
GridStore.unlink = function(db, names, options, callback) {
  var self = this;
  var args = Array.prototype.slice.call(arguments, 2);
  callback = args.pop();
  options = args.length ? args.shift() : null;

  if(names.constructor == Array) {
    var tc = 0;
    for(var i = 0; i < names.length; i++) {
      ++tc;
      self.unlink(db, names[i], function(result) {
        if(--tc == 0) {
            callback(null, self);
        }
      });
    }
  } else {
    new GridStore(db, names, "w", options).open(function(err, gridStore) {
      deleteChunks(gridStore, function(err, result) {
        gridStore.collection(function(err, collection) {
          collection.remove({'_id':gridStore.fileId}, {safe:true}, function(err, collection) {
            callback(err, self);
          });
        });
      });
    });
  }
};

/**
 * @ignore
 * @api private
 */
exports.GridStore = GridStore;
