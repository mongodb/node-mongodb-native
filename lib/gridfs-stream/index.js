var GridFSBucketWriteStream = require('./upload');
var shallowClone = require('../utils').shallowClone;

var DEFAULT_GRIDFS_BUCKET_OPTIONS = {
  bucketName: 'fs',
  chunkSizeBytes: 255 * 1024
};

module.exports = GridFSBucket;

/**
 * Constructor for a streaming GridFS interface
 * @method
 * @param {Db} db A db handle
 * @param {object} [options=null] Optional settings.
 */

function GridFSBucket(db, options) {
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
    _filesCollection: db.collection(options.bucketName + '.files')
  };
};

/**
 * Returns a writable stream (GridFSBucketWriteStream) for writing
 * buffers to GridFS.
 * @method
 * @param {string} filename The value of the 'filename' key in the files doc
 * @param {object} [options=null] Optional settings.
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
  return new GridFSBucketWriteStream(this.s._chunksCollection,
    this.s._filesCollection, filename, options);
};
