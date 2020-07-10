import * as _BSON from 'bson';
let BSON: typeof _BSON = require('bson');
try {
  BSON = require('bson-ext');
} catch (_) {} // eslint-disable-line

export = BSON;
