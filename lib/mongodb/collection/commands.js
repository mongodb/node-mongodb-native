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
  var commandObject = {
      'count': this.collectionName
    , 'query': query
    , 'fields': null
  };

  // Add limit and skip if defined
  if(typeof skip == 'number') commandObject.skip = skip;
  if(typeof limit == 'number') commandObject.limit = limit;
  if(typeof maxTimeMS == 'number') commandObject['$maxTimeMS'] = maxTimeMS;

  // Set read preference if we set one
  var readPreference = shared._getReadConcern(this, options);
  // Execute the command
  this.db._executeQueryCommand(DbCommand.createDbSlaveOkCommand(this.db, commandObject)
    , {read: readPreference}
    , utils.handleSingleCommandResultReturn(null, null, function(err, result) {
      if(err) return callback(err, null);
      if(result == null) return callback(new Error("no result returned for count"), null);
      callback(null, result.n);
    }));
};

var distinct = function distinct(key, query, options, callback) {
  var args = Array.prototype.slice.call(arguments, 1);
  callback = args.pop();
  query = args.length ? args.shift() || {} : {};
  options = args.length ? args.shift() || {} : {};

  var mapCommandHash = {
      'distinct': this.collectionName
    , 'query': query
    , 'key': key
  };

  // Set read preference if we set one
  var readPreference = options['readPreference'] ? options['readPreference'] : false;
  // Create the command
  var cmd = DbCommand.createDbSlaveOkCommand(this.db, mapCommandHash);

  this.db._executeQueryCommand(cmd, {read:readPreference}, function (err, result) {
    if(err)
      return callback(err);
    if(result.documents[0].ok != 1)
      return callback(new Error(result.documents[0].errmsg));
    callback(null, result.documents[0].values);
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
  
  // Execute the command, return the new renamed collection if successful
  self.db._executeQueryCommand(DbCommand.createRenameCollectionCommand(self.db, self.collectionName, newName, options)
    , utils.handleSingleCommandResultReturn(true, false, function(err, result) {
      if(err) return callback(err, null)
      try {
        if(options.new_collection)
          return callback(null, new Collection(self.db, newName, self.db.pkFactory));
        self.collectionName = newName;
        callback(null, self);
      } catch(err) {
        callback(err, null);
      }
    }));
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