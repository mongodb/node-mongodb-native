var _getWriteConcern = require('./shared')._getWriteConcern;

var createIndex = function createIndex (fieldOrSpec, options, callback) {
  // Clean up call
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};
  options = typeof callback === 'function' ? options : callback;
  options = options == null ? {} : options;

  // Collect errorOptions
  var errorOptions = _getWriteConcern(this, options);
  // Execute create index
  this.db.createIndex(this.collectionName, fieldOrSpec, options, callback);
};

var indexExists = function indexExists(indexes, callback) {
 this.indexInformation(function(err, indexInformation) {
   // If we have an error return
   if(err != null) return callback(err, null);
   // Let's check for the index names
   if(Array.isArray(indexes)) {
     for(var i = 0; i < indexes.length; i++) {
       if(indexInformation[indexes[i]] == null) {
         return callback(null, false);
       }
     }

     // All keys found return true
     return callback(null, true);
   } else {
     return callback(null, indexInformation[indexes] != null);
   }
 });
}

var dropAllIndexes = function dropIndexes (callback) {
  this.db.dropIndex(this.collectionName, '*', function (err, result) {
    if(err) return callback(err, false);
    callback(null, true);
  });
};

var indexInformation = function indexInformation (options, callback) {
  // Unpack calls
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  options = args.length ? args.shift() || {} : {};
  // Call the index information
  this.db.indexInformation(this.collectionName, options, callback);
};

var ensureIndex = function ensureIndex (fieldOrSpec, options, callback) {
  // Clean up call
  if (typeof callback === 'undefined' && typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (options == null) {
    options = {};
  }

  // Execute create index
  this.db.ensureIndex(this.collectionName, fieldOrSpec, options, callback);
};

exports.createIndex = createIndex;
exports.indexExists = indexExists;
exports.dropAllIndexes = dropAllIndexes;
exports.indexInformation = indexInformation;
exports.ensureIndex = ensureIndex;
