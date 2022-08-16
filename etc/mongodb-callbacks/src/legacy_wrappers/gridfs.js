'use strict';

const { toLegacy, maybeCallback } = require('../utils');

module.exports = Object.create(null);

module.exports.makeLegacyGridFSBucket = function (baseClass) {
  class LegacyGridFSBucket extends baseClass {
    constructor(db, options) {
      if (db instanceof baseClass || db instanceof LegacyGridFSBucket) {
        super(db.s.db, db.s.options);
      } else {
        super(db, options);
      }
    }

    delete(id, callback) {
      return maybeCallback(super.delete(id), callback);
    }

    rename(id, filename, callback) {
      return maybeCallback(super.rename(id, filename), callback);
    }

    drop(callback) {
      return maybeCallback(super.drop(), callback);
    }

    // conversion
    find(filter, options) {
      return super.find(filter, options)[toLegacy]();
    }
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyGridFSBucket(this);
    }
  });

  return LegacyGridFSBucket;
};
