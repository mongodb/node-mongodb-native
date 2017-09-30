'use strict';

const crypto = require('crypto');

/**
 * Copy the values of all enumerable own properties from one or more
 * source objects to a target object. It will return the target object.
 */
const assign = Object.assign
  ? Object.assign
  : function assign(target) {
      if (target === undefined || target === null) {
        throw new TypeError('Cannot convert first argument to object');
      }

      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var nextSource = arguments[i];
        if (nextSource === undefined || nextSource === null) {
          continue;
        }

        var keysArray = Object.keys(Object(nextSource));
        for (var nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex++) {
          var nextKey = keysArray[nextIndex];
          var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
          if (desc !== undefined && desc.enumerable) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }

      return to;
    };

const uuidV4 = () => {
  const result = crypto.randomBytes(16);
  result[6] = (result[6] & 0x0f) | 0x40;
  result[8] = (result[8] & 0x3f) | 0x80;
  return result;
};

module.exports = {
  assign: assign,
  uuidV4: uuidV4
};
