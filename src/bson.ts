import type * as _BSON from 'bson';
let BSON: typeof _BSON = require('bson');
try {
  BSON = require('bson-ext');
} catch {} // eslint-disable-line

export = BSON;
