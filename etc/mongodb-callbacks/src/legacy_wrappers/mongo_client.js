'use strict';

const { toLegacy, maybeCallback } = require('../utils');

module.exports = Object.create(null);

module.exports.makeLegacyMongoClient = function (baseClass) {
  class LegacyMongoClient extends baseClass {
    constructor(url, options) {
      if (url instanceof baseClass || url instanceof LegacyMongoClient) {
        super(url.s.url, url.s.userOptions);
      } else {
        super(url, options);
      }
    }

    static connect(url, options, callback) {
      callback =
        typeof callback === 'function'
          ? callback
          : typeof options === 'function'
          ? options
          : undefined;
      options = typeof options !== 'function' ? options : undefined;
      return maybeCallback(baseClass.connect(url, options), callback, client => client[toLegacy]());
    }

    connect(callback) {
      return maybeCallback(super.connect(), callback, client => client[toLegacy]());
    }

    close(force, callback) {
      callback =
        typeof callback === 'function' ? callback : typeof force === 'function' ? force : undefined;
      force = typeof force !== 'function' ? force : undefined;
      return maybeCallback(super.close(force), callback);
    }

    // Convert to legacy versions of the following:
    db(dbName, options) {
      return super.db(dbName, options)[toLegacy]();
    }

    watch(pipeline, options) {
      return super.watch(pipeline, options)[toLegacy]();
    }
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyMongoClient(this);
    }
  });

  return LegacyMongoClient;
};
