'use strict';

var Emitter = require('events').EventEmitter;
var GridFSBucketReadStream = require('./download');
var GridFSBucketWriteStream = require('./upload');
var shallowClone = require('../utils').shallowClone;
var toError = require('../utils').toError;
var util = require('util');
var executeLegacyOperation = require('../utils').executeLegacyOperation;

var DEFAULT_GRIDFS_BUCKET_OPTIONS = {
  bucketName: 'fs',
  chunkSizeBytes: 255 * 1024
};

module.exports = GridFSBucket;

/**
 * Constructor for a streaming GridFS interface
 * @class
 * @extends external:EventEmitter
 * @param {Db} db A db handle
 * @param {object} [options] Optional settings.
 * @param {string} [options.bucketName="fs"] The 'files' and 'chunks' collections will be prefixed with the bucket name followed by a dot.
 * @param {number} [options.chunkSizeBytes=255 * 1024] Number of bytes stored in each chunk. Defaults to 255KB
 * @param {object} [options.writeConcern] Optional write concern to be passed to write operations, for instance `{ w: 1 }`
 * @param {object} [options.readPreference] Optional read preference to be passed to read operations
 * @fires GridFSBucketWriteStream#index
 */

function GridFSBucket(db, options) {
  Emitter.apply(this);
  this.setMaxListeners(0);

  if (options && typeof options === 'object') {
    options = shallowClone(options);
    var keys = Object.keys(DEFAULT_GRIDFS_BUCKET_OPTIONS);
    for (var i = 0; i < keys.length; ++i) {
      if (!options[keys[i]]) {
        options[keys[i]] = DEFAULT_GRIDFS_BUCKET_OPTIONS[keys[i]];
      }
    }
  } else {
    options = DEFAULT_GRIDFS_BUCKET_OPTIONS;
  }

  this.s = {
    db: db,
    options: options,
    _chunksCollection: db.collection(options.bucketName + '.chunks'),
    _filesCollection: db.collection(options.bucketName + '.files'),
    checkedIndexes: false,
    calledOpenUploadStream: false,
    promiseLibrary: db.s.promiseLibrary || Promise
  };
}

util.inherits(GridFSBucket, Emitter);

/**
 * When the first call to openUploadStream is made, the upload stream will
 * check to see if it needs to create the proper indexes on the chunks and
 * files collections. This event is fired either when 1) it determines that
 * no index creation is necessary, 2) when it successfully creates the
 * necessary indexes.
 *
 * @event GridFSBucket#index
 * @type {Error}
 */

/**
 * Returns a writable stream (GridFSBucketWriteStream) for writing
 * buffers to GridFS. The stream's 'id' property contains the resulting
 * file's id.
 * @method
 * @param {string} filename The value of the 'filename' key in the files doc
 * @param {object} [options] Optional settings.
 * @param {number} [options.chunkSizeBytes] Optional overwrite this bucket's chunkSizeBytes for this file
 * @param {object} [options.metadata] Optional object to store in the file document's `metadata` field
 * @param {string} [options.contentType] Optional string to store in the file document's `contentType` field
 * @param {array} [options.aliases] Optional array of strings to store in the file document's `aliases` field
 * @param {boolean} [options.disableMD5=false] If true, disables adding an md5 field to file data
 * @return {GridFSBucketWriteStream}
 */

GridFSBucket.prototype.openUploadStream = function(filename, options) {
  if (options) {
    options = shallowClone(options);
  } else {
    options = {};
  }
  if (!options.chunkSizeBytes) {
    options.chunkSizeBytes = this.s.options.chunkSizeBytes;
  }
  return new GridFSBucketWriteStream(this, filename, options);
};

/**
 * Returns a writable stream (GridFSBucketWriteStream) for writing
 * buffers to GridFS for a custom file id. The stream's 'id' property contains the resulting
 * file's id.
 * @method
 * @param {string|number|object} id A custom id used to identify the file
 * @param {string} filename The value of the 'filename' key in the files doc
 * @param {object} [options] Optional settings.
 * @param {number} [options.chunkSizeBytes] Optional overwrite this bucket's chunkSizeBytes for this file
 * @param {object} [options.metadata] Optional object to store in the file document's `metadata` field
 * @param {string} [options.contentType] Optional string to store in the file document's `contentType` field
 * @param {array} [options.aliases] Optional array of strings to store in the file document's `aliases` field
 * @param {boolean} [options.disableMD5=false] If true, disables adding an md5 field to file data
 * @return {GridFSBucketWriteStream}
 */

GridFSBucket.prototype.openUploadStreamWithId = function(id, filename, options) {
  if (options) {
    options = shallowClone(options);
  } else {
    options = {};
  }

  if (!options.chunkSizeBytes) {
    options.chunkSizeBytes = this.s.options.chunkSizeBytes;
  }

  options.id = id;

  return new GridFSBucketWriteStream(this, filename, options);
};

/**
 * Returns a readable stream (GridFSBucketReadStream) for streaming file
 * data from GridFS.
 * @method
 * @param {ObjectId} id The id of the file doc
 * @param {Object} [options] Optional settings.
 * @param {Number} [options.start] Optional 0-based offset in bytes to start streaming from
 * @param {Number} [options.end] Optional 0-based offset in bytes to stop streaming before
 * @return {GridFSBucketReadStream}
 */

GridFSBucket.prototype.openDownloadStream = function(id, options) {
  var filter = { _id: id };
  options = {
    start: options && options.start,
    end: options && options.end
  };

  return new GridFSBucketReadStream(
    this.s._chunksCollection,
    this.s._filesCollection,
    this.s.options.readPreference,
    filter,
    options
  );
};

/**
 * Deletes a file with the given id
 * @method
 * @param {ObjectId} id The id of the file doc
 * @param {GridFSBucket~errorCallback} [callback]
 */

GridFSBucket.prototype.delete = function(id, callback) {
  return executeLegacyOperation(this.s.db.s.topology, _delete, [this, id, callback], {
    skipSessions: true
  });
};

/**
 * @ignore
 */

function _delete(_this, id, callback) {
  _this.s._filesCollection.deleteOne({ _id: id }, function(error, res) {
    if (error) {
      return callback(error);
    }

    _this.s._chunksCollection.deleteMany({ files_id: id }, function(error) {
      if (error) {
        return callback(error);
      }

      // Delete orphaned chunks before returning FileNotFound
      if (!res.result.n) {
        var errmsg = 'FileNotFound: no file with id ' + id + ' found';
        return callback(new Error(errmsg));
      }

      callback();
    });
  });
}

/**
 * Convenience wrapper around find on the files collection
 * @method
 * @param {Object} filter
 * @param {Object} [options] Optional settings for cursor
 * @param {number} [options.batchSize=1000] The number of documents to return per batch. See {@link https://docs.mongodb.com/manual/reference/command/find|find command documentation}.
 * @param {number} [options.limit] Optional limit for cursor
 * @param {number} [options.maxTimeMS] Optional maxTimeMS for cursor
 * @param {boolean} [options.noCursorTimeout] Optionally set cursor's `noCursorTimeout` flag
 * @param {number} [options.skip] Optional skip for cursor
 * @param {object} [options.sort] Optional sort for cursor
 * @return {Cursor}
 */

GridFSBucket.prototype.find = function(filter, options) {
  filter = filter || {};
  options = options || {};

  var cursor = this.s._filesCollection.find(filter);

  if (options.batchSize != null) {
    cursor.batchSize(options.batchSize);
  }
  if (options.limit != null) {
    cursor.limit(options.limit);
  }
  if (options.maxTimeMS != null) {
    cursor.maxTimeMS(options.maxTimeMS);
  }
  if (options.noCursorTimeout != null) {
    cursor.addCursorFlag('noCursorTimeout', options.noCursorTimeout);
  }
  if (options.skip != null) {
    cursor.skip(options.skip);
  }
  if (options.sort != null) {
    cursor.sort(options.sort);
  }

  return cursor;
};

/**
 * Returns a readable stream (GridFSBucketReadStream) for streaming the
 * file with the given name from GridFS. If there are multiple files with
 * the same name, this will stream the most recent file with the given name
 * (as determined by the `uploadDate` field). You can set the `revision`
 * option to change this behavior.
 * @method
 * @param {String} filename The name of the file to stream
 * @param {Object} [options] Optional settings
 * @param {number} [options.revision=-1] The revision number relative to the oldest file with the given filename. 0 gets you the oldest file, 1 gets you the 2nd oldest, -1 gets you the newest.
 * @param {Number} [options.start] Optional 0-based offset in bytes to start streaming from
 * @param {Number} [options.end] Optional 0-based offset in bytes to stop streaming before
 * @return {GridFSBucketReadStream}
 */

GridFSBucket.prototype.openDownloadStreamByName = function(filename, options) {
  var sort = { uploadDate: -1 };
  var skip = null;
  if (options && options.revision != null) {
    if (options.revision >= 0) {
      sort = { uploadDate: 1 };
      skip = options.revision;
    } else {
      skip = -options.revision - 1;
    }
  }

  var filter = { filename: filename };
  options = {
    sort: sort,
    skip: skip,
    start: options && options.start,
    end: options && options.end
  };
  return new GridFSBucketReadStream(
    this.s._chunksCollection,
    this.s._filesCollection,
    this.s.options.readPreference,
    filter,
    options
  );
};

/**
 * Renames the file with the given _id to the given string
 * @method
 * @param {ObjectId} id the id of the file to rename
 * @param {String} filename new name for the file
 * @param {GridFSBucket~errorCallback} [callback]
 */

GridFSBucket.prototype.rename = function(id, filename, callback) {
  return executeLegacyOperation(this.s.db.s.topology, _rename, [this, id, filename, callback], {
    skipSessions: true
  });
};

/**
 * @ignore
 */

function _rename(_this, id, filename, callback) {
  var filter = { _id: id };
  var update = { $set: { filename: filename } };
  _this.s._filesCollection.updateOne(filter, update, function(error, res) {
    if (error) {
      return callback(error);
    }
    if (!res.result.n) {
      return callback(toError('File with id ' + id + ' not found'));
    }
    callback();
  });
}

/**
 * Removes this bucket's files collection, followed by its chunks collection.
 * @method
 * @param {GridFSBucket~errorCallback} [callback]
 */

GridFSBucket.prototype.drop = function(callback) {
  return executeLegacyOperation(this.s.db.s.topology, _drop, [this, callback], {
    skipSessions: true
  });
};

/**
 * Return the db logger
 * @method
 * @return {Logger} return the db logger
 * @ignore
 */
GridFSBucket.prototype.getLogger = function() {
  return this.s.db.s.logger;
};

/**
 * @ignore
 */

function _drop(_this, callback) {
  _this.s._filesCollection.drop(function(error) {
    if (error) {
      return callback(error);
    }
    _this.s._chunksCollection.drop(function(error) {
      if (error) {
        return callback(error);
      }

      return callback();
    });
  });
}

/**
 * Callback format for all GridFSBucket methods that can accept a callback.
 * @callback GridFSBucket~errorCallback
 * @param {MongoError|undefined} error If present, an error instance representing any errors that occurred
 * @param {*} result If present, a returned result for the method
 */
