'use strict';

const applyWriteConcern = require('../utils').applyWriteConcern;
const Collection = require('../collection');
const f = require('util').format;
const handleCallback = require('../utils').handleCallback;
const MongoError = require('mongodb-core').MongoError;
const ReadPreference = require('mongodb-core').ReadPreference;
const shallowClone = require('../utils').shallowClone;

// Filter out any write concern options
const illegalCommandFields = [
  'w',
  'wtimeout',
  'j',
  'fsync',
  'autoIndexId',
  'strict',
  'serializeFunctions',
  'pkFactory',
  'raw',
  'readPreference',
  'session'
];

const createCollection = function(self, name, options, callback) {
  // Get the write concern options
  const finalOptions = applyWriteConcern(shallowClone(options), { db: self }, options);

  // Did the user destroy the topology
  if (self.serverConfig && self.serverConfig.isDestroyed()) {
    return callback(new MongoError('topology was destroyed'));
  }

  const listCollectionOptions = Object.assign({}, finalOptions, { nameOnly: true });

  // Check if we have the name
  self
    .listCollections({ name: name }, listCollectionOptions)
    .setReadPreference(ReadPreference.PRIMARY)
    .toArray(function(err, collections) {
      if (err != null) return handleCallback(callback, err, null);
      if (collections.length > 0 && finalOptions.strict) {
        return handleCallback(
          callback,
          MongoError.create({
            message: f('Collection %s already exists. Currently in strict mode.', name),
            driver: true
          }),
          null
        );
      } else if (collections.length > 0) {
        try {
          return handleCallback(
            callback,
            null,
            new Collection(
              self,
              self.s.topology,
              self.s.databaseName,
              name,
              self.s.pkFactory,
              options
            )
          );
        } catch (err) {
          return handleCallback(callback, err);
        }
      }

      // Create collection command
      var cmd = { create: name };

      // Decorate command with writeConcern if supported
      applyWriteConcern(cmd, { db: self }, options);

      // Add all optional parameters
      for (var n in options) {
        if (
          options[n] != null &&
          typeof options[n] !== 'function' &&
          illegalCommandFields.indexOf(n) === -1
        ) {
          cmd[n] = options[n];
        }
      }

      // Force a primary read Preference
      finalOptions.readPreference = ReadPreference.PRIMARY;

      // Execute command
      self.command(cmd, finalOptions, function(err) {
        if (err) return handleCallback(callback, err);
        handleCallback(
          callback,
          null,
          new Collection(
            self,
            self.s.topology,
            self.s.databaseName,
            name,
            self.s.pkFactory,
            options
          )
        );
      });
    });
};

const dropCollection = (self, cmd, options, callback) => {
  return self.command(cmd, options, function(err, result) {
    // Did the user destroy the topology
    if (self.serverConfig && self.serverConfig.isDestroyed()) {
      return callback(new MongoError('topology was destroyed'));
    }

    if (err) return handleCallback(callback, err);
    if (result.ok) return handleCallback(callback, null, true);
    handleCallback(callback, null, false);
  });
};

exports.createCollection = createCollection;
exports.dropCollection = dropCollection;
