'use strict';

const { toLegacy, maybeCallback } = require('../utils');

module.exports = Object.create(null);

module.exports.makeLegacyAdmin = function (baseClass) {
  class LegacyAdmin extends baseClass {
    constructor(db) {
      if (db instanceof baseClass || db instanceof LegacyAdmin) {
        super(db.s.db);
      } else {
        super(db);
      }
    }

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

    buildInfo(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.buildInfo(options), callback);
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

    listDatabases(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.listDatabases(options), callback);
    }

    ping(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.ping(options), callback);
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

    replSetGetStatus(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.replSetGetStatus(options), callback);
    }

    serverInfo(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.serverInfo(options), callback);
    }

    serverStatus(options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.serverStatus(options), callback);
    }

    validateCollection(name, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(super.validateCollection(name, options), callback);
    }
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyAdmin(this);
    }
  });

  return LegacyAdmin;
};
