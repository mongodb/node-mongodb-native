var shared = require('./shared')
  , utils = require('../utils')
  , DbCommand = require('../commands/db_command').DbCommand;

var stats = function stats(options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  // Fetch all commands
  options = args.length ? args.shift() || {} : {};

  // Build command object
  var commandObject = {
    collStats:this.collectionName,
  }

  // Check if we have the scale value
  if(options['scale'] != null) commandObject['scale'] = options['scale'];

  // Ensure we have the right read preference inheritance
  options.readPreference = shared._getReadConcern(this, options);

  // Execute the command
  this.db.command(commandObject, options, callback);
}

var count = function count(query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 0);
  callback = args.pop();
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};
  var skip = options.skip;
  var limit = options.limit;
  var maxTimeMS = options.maxTimeMS;

  // Final query
  var cmd = {
      'count': this.collectionName
    , 'query': query
    , 'fields': null
  };

  // Add limit and skip if defined
  if(typeof skip == 'number') cmd.skip = skip;
  if(typeof limit == 'number') cmd.limit = limit;

  // Ensure we have the right read preference inheritance
  options.readPreference = shared._getReadConcern(this, options);

  // Execute the command
  this.db.command(cmd, options, function(err, result) {
    if(err) return callback(err);
    callback(null, result.n);
  });
};

var distinct = function distinct(key, query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};
  var maxTimeMS = options.maxTimeMS;

  var cmd = {
      'distinct': this.collectionName
    , 'key': key
    , 'query': query
  };

  // Ensure we have the right read preference inheritance
  options.readPreference = shared._getReadConcern(this, options);

  // Execute the command
  this.db.command(cmd, options, function(err, result) {
    if(err) return callback(err);
    callback(null, result.values);
  });
};

var rename = function rename (newName, options, callback) {
  var self = this;
  if(typeof options == 'function') {
    callback = options;
    options = {}
  }

  // Get collection class
  var Collection = require('../collection').Collection;
  // Ensure the new name is valid
  shared.checkCollectionName(newName);
  
  // Build the command
  var renameCollection = self.db.databaseName + "." + self.collectionName;
  var toCollection = self.db.databaseName + "." + newName;
  var dropTarget = typeof options.dropTarget == 'boolean' ? options.dropTarget : false;
  var cmd = {'renameCollection':renameCollection, 'to':toCollection, 'dropTarget':dropTarget};

  // Execute against admin
  self.db.admin().command(cmd, options, function(err, result) {
    if(err) return callback(err, null);
    var doc = result.documents[0];
    // We have an error
    if(doc.errmsg) return callback(utils.toError(doc), null);
    try {
      if(options.new_collection)
        return callback(null, new Collection(self.db, newName, self.db.pkFactory));
      self.collectionName = newName;
      callback(null, self);      
    } catch(err) {
      return callback(utils.toError(err), null);
    }
  });
};

var options = function options(callback) {
  this.db.collectionsInfo(this.collectionName, function (err, cursor) {
    if (err) return callback(err);
    cursor.nextObject(function (err, document) {
      callback(err, document && document.options || null);
    });
  });
};

var isCapped = function isCapped(callback) {
  this.options(function(err, document) {
    if(err != null) {
      callback(err);
    } else {
      callback(null, document && document.capped);
    }
  });
};

exports.stats = stats;
exports.count = count;
exports.distinct = distinct;
exports.rename = rename;
exports.options = options;
exports.isCapped = isCapped;