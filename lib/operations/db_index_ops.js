'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Db = require('../db');
const f = require('util').format;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const parseIndexOptions = require('../utils').parseIndexOptions;
const ReadPreference = require('mongodb-core').ReadPreference;
const toError = require('../utils').toError;

const createIndex = function(self, name, fieldOrSpec, options, callback) {
  // Get the write concern options
  var finalOptions = Object.assign({}, { readPreference: ReadPreference.PRIMARY }, options);
  finalOptions = applyWriteConcern(finalOptions, { db: self }, options);

  // Ensure we have a callback
  if (finalOptions.writeConcern && typeof callback !== 'function') {
    throw MongoError.create({
      message: 'Cannot use a writeConcern without a provided callback',
      driver: true
    });
  }

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // Attempt to run using createIndexes command
  createIndexUsingCreateIndexes(self, name, fieldOrSpec, options, function(err, result) {
    if (err == null) return handleCallback(callback, err, result);

    // 67 = 'CannotCreateIndex' (malformed index options)
    // 85 = 'IndexOptionsConflict' (index already exists with different options)
    // 86 = 'IndexKeySpecsConflict' (index already exists with the same name)
    // 11000 = 'DuplicateKey' (couldn't build unique index because of dupes)
    // 11600 = 'InterruptedAtShutdown' (interrupted at shutdown)
    // These errors mean that the server recognized `createIndex` as a command
    // and so we don't need to fallback to an insert.
    if (
      err.code === 67 ||
      err.code === 11000 ||
      err.code === 85 ||
      err.code === 86 ||
      err.code === 11600
    ) {
      return handleCallback(callback, err, result);
    }

    // Create command
    var doc = createCreateIndexCommand(self, name, fieldOrSpec, options);
    // Set no key checking
    finalOptions.checkKeys = false;
    // Insert document
    self.s.topology.insert(
      f('%s.%s', self.s.databaseName, Db.SYSTEM_INDEX_COLLECTION),
      doc,
      finalOptions,
      function(err, result) {
        if (callback == null) return;
        if (err) return handleCallback(callback, err);
        if (result == null) return handleCallback(callback, null, null);
        if (result.result.writeErrors)
          return handleCallback(callback, MongoError.create(result.result.writeErrors[0]), null);
        handleCallback(callback, null, doc.name);
      }
    );
  });
};

const createIndexUsingCreateIndexes = function(self, name, fieldOrSpec, options, callback) {
  // Build the index
  var indexParameters = parseIndexOptions(fieldOrSpec);
  // Generate the index name
  var indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
  // Set up the index
  var indexes = [{ name: indexName, key: indexParameters.fieldHash }];
  // merge all the options
  var keysToOmit = Object.keys(indexes[0]).concat([
    'w',
    'wtimeout',
    'j',
    'fsync',
    'readPreference',
    'session'
  ]);

  for (var optionName in options) {
    if (keysToOmit.indexOf(optionName) === -1) {
      indexes[0][optionName] = options[optionName];
    }
  }

  // Get capabilities
  var capabilities = self.s.topology.capabilities();

  // Did the user pass in a collation, check if our write server supports it
  if (indexes[0].collation && capabilities && !capabilities.commandsTakeCollation) {
    // Create a new error
    var error = new MongoError(f('server/primary/mongos does not support collation'));
    error.code = 67;
    // Return the error
    return callback(error);
  }

  // Create command, apply write concern to command
  var cmd = applyWriteConcern({ createIndexes: name, indexes: indexes }, { db: self }, options);

  // ReadPreference primary
  options.readPreference = ReadPreference.PRIMARY;

  // Build the command
  self.command(cmd, options, function(err, result) {
    if (err) return handleCallback(callback, err, null);
    if (result.ok === 0) return handleCallback(callback, toError(result), null);
    // Return the indexName for backward compatibility
    handleCallback(callback, null, indexName);
  });
};

const createCreateIndexCommand = function(db, name, fieldOrSpec, options) {
  var indexParameters = parseIndexOptions(fieldOrSpec);
  var fieldHash = indexParameters.fieldHash;

  // Generate the index name
  var indexName = typeof options.name === 'string' ? options.name : indexParameters.name;
  var selector = {
    ns: db.databaseName + '.' + name,
    key: fieldHash,
    name: indexName
  };

  // Ensure we have a correct finalUnique
  var finalUnique = options == null || 'object' === typeof options ? false : options;
  // Set up options
  options = options == null || typeof options === 'boolean' ? {} : options;

  // Add all the options
  var keysToOmit = Object.keys(selector);
  for (var optionName in options) {
    if (keysToOmit.indexOf(optionName) === -1) {
      selector[optionName] = options[optionName];
    }
  }

  if (selector['unique'] == null) selector['unique'] = finalUnique;

  // Remove any write concern operations
  var removeKeys = ['w', 'wtimeout', 'j', 'fsync', 'readPreference'];
  for (var i = 0; i < removeKeys.length; i++) {
    delete selector[removeKeys[i]];
  }

  // Return the command creation selector
  return selector;
};

const ensureIndex = function(self, name, fieldOrSpec, options, callback) {
  // Get the write concern options
  var finalOptions = applyWriteConcern({}, { db: self }, options);
  // Create command
  var selector = createCreateIndexCommand(self, name, fieldOrSpec, options);
  var index_name = selector.name;

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));

  // Merge primary readPreference
  finalOptions.readPreference = ReadPreference.PRIMARY;

  // Check if the index allready exists
  self.indexInformation(name, finalOptions, function(err, indexInformation) {
    if (err != null && err.code !== 26) return handleCallback(callback, err, null);
    // If the index does not exist, create it
    if (indexInformation == null || !indexInformation[index_name]) {
      self.createIndex(name, fieldOrSpec, options, callback);
    } else {
      if (typeof callback === 'function') return handleCallback(callback, null, index_name);
    }
  });
};

const indexInformation = function(self, name, options, callback) {
  // If we specified full information
  var full = options['full'] == null ? false : options['full'];

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed())
    return callback(new MongoError('topology was destroyed'));
  // Process all the results from the index command and collection
  var processResults = function(indexes) {
    // Contains all the information
    var info = {};
    // Process all the indexes
    for (var i = 0; i < indexes.length; i++) {
      var index = indexes[i];
      // Let's unpack the object
      info[index.name] = [];
      for (var name in index.key) {
        info[index.name].push([name, index.key[name]]);
      }
    }

    return info;
  };

  // Get the list of indexes of the specified collection
  self
    .collection(name)
    .listIndexes(options)
    .toArray(function(err, indexes) {
      if (err) return callback(toError(err));
      if (!Array.isArray(indexes)) return handleCallback(callback, null, []);
      if (full) return handleCallback(callback, null, indexes);
      handleCallback(callback, null, processResults(indexes));
    });
};

exports.createIndex = createIndex;
exports.ensureIndex = ensureIndex;
exports.indexInformation = indexInformation;
