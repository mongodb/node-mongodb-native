'use strict';
const { MongoClient } = require('../../src');
const CONFIGS = ['ATLAS_REPL', 'ATLAS_SHRD', 'ATLAS_FREE', 'ATLAS_TLS11', 'ATLAS_TLS12'].map(
  name => {
    return {
      name,
      url: process.env[name]
    };
  }
);

describe('Atlas Connectivity', function() {
  CONFIGS.forEach(config => {
    it(`${config.name}`, function() {
      const client = new MongoClient(config.url);
      return Promise.resolve()
        .then(() => client.connect())
        .then(() => client.db('admin').command({ ismaster: 1 }))
        .then(() =>
          client
            .db('test')
            .collection('test')
            .findOne({})
        )
        .finally(() => client.close());
    });
  });
});
