'use strict';

module.exports = ['error', 'warn', 'none'].reduce((obj, key) => {
  obj[key] = key;
  return obj;
}, {});
