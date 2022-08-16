'use strict';

const { toLegacy, maybeCallback } = require('../utils');

module.exports = Object.create(null);

module.exports.makeLegacyDb = function (baseClass) {
  class LegacyDb extends baseClass {
    constructor(client, databaseName, options) {
      if (client instanceof baseClass || client instanceof LegacyDb) {
        super(client.s.client, client.databaseName, client.s.options);
      } else {
        super(client, databaseName, options);
      }
    }

    command(command, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.command(command, options), callback);
    }

    // Async APIs
    addUser(username, password, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : typeof password === 'function'
          ? password
          : undefined;
      options =
        typeof options !== 'function'
          ? options
          : typeof password !== 'function'
          ? password
          : undefined;
      return maybeCallback(super.addUser(username, password, options), callback);
    }

    removeUser(username, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.removeUser(username, options), callback);
    }

    createCollection(name, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.createCollection(name, options), callback, collection =>
        collection[toLegacy]()
      );
    }

    dropCollection(name, options, callback) {
      return maybeCallback(super.dropCollection(name, options), callback);
    }

    createIndex(name, indexSpec, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.createIndex(name, indexSpec, options), callback);
    }

    dropDatabase(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.dropDatabase(options), callback);
    }

    indexInformation(name, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.indexInformation(name, options), callback);
    }

    profilingLevel(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.profilingLevel(options), callback);
    }

    setProfilingLevel(level, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.setProfilingLevel(level, options), callback);
    }

    renameCollection(from, to, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.renameCollection(from, to, options), callback);
    }

    stats(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.stats(options), callback);
    }

    // Convert Result to legacy
    collections(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.collections(options), callback, collections =>
        collections.map(collection => collection[toLegacy]())
      );
    }
    collection(name, options) {
      return super.collection(name, options)[toLegacy]();
    }
    admin() {
      return super.admin()[toLegacy]();
    }
    aggregate(pipeline, options) {
      return super.aggregate(pipeline, options)[toLegacy]();
    }
    listCollections(filter, options) {
      return super.listCollections(filter, options)[toLegacy]();
    }
    watch(pipeline, options) {
      return super.watch(pipeline, options)[toLegacy]();
    }
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyDb(this);
    }
  });

  return LegacyDb;
};
