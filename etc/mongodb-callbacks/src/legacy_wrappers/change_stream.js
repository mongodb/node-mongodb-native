'use strict';

const { toLegacy, maybeCallback } = require('../utils');

module.exports = Object.create(null);

module.exports.makeLegacyChangeStream = function (baseClass) {
  class LegacyChangeStream extends baseClass {
    constructor(parent, pipeline, options) {
      if (parent instanceof baseClass || parent instanceof LegacyChangeStream) {
        super(parent.parent, parent.pipeline, parent.options);
      } else {
        super(parent, pipeline, options);
      }
    }

    close(callback) {
      return maybeCallback(super.close(), callback);
    }
    hasNext(callback) {
      return maybeCallback(super.hasNext(), callback);
    }
    next(callback) {
      return maybeCallback(super.next(), callback);
    }
    tryNext(callback) {
      return maybeCallback(super.tryNext(), callback);
    }
  }

  Object.defineProperty(baseClass.prototype, toLegacy, {
    enumerable: false,
    value: function () {
      return new LegacyChangeStream(this);
    }
  });

  return LegacyChangeStream;
};
