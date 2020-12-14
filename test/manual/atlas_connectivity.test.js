'use strict';
const { MongoClient } = require('../../src');

describe('Atlas Connectivity', function () {
  if (process.env.ATLAS_CONNECTIVITY == null) {
    console.error(
      'skipping atlas connectivity tests, ATLAS_CONNECTIVITY environment variable is not defined'
    );

    return;
  }

  const CONFIGS = JSON.parse(process.env.ATLAS_CONNECTIVITY);
  Object.keys(CONFIGS).forEach(configName => {
    context(configName, function () {
      CONFIGS[configName].forEach(connectionString => {
        const name = connectionString.indexOf('mongodb+srv') >= 0 ? 'mongodb+srv' : 'normal';
        it(`${name}`, makeConnectionTest(connectionString));
      });
    });
  });
});

function makeConnectionTest(connectionString, clientOptions) {
  return function () {
    const client = new MongoClient(connectionString, clientOptions);

    return client
      .connect()
      .then(() => client.db('admin').command({ ismaster: 1 }))
      .then(() => client.db('test').collection('test').findOne({}))
      .then(() => client.close());
  };
}
