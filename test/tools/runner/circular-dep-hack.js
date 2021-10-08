'use strict';

// NODE-2899 remove this circular dependency workaround hack
const { MongoClient } = require('../../../src');
if (!MongoClient) {
  throw new Error('MongoClient should exist');
}
