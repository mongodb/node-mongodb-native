'use strict';

const MongoClient = require('../').MongoClient;

const CONFIGS = ['ATLAS_REPL', 'ATLAS_SHRD', 'ATLAS_FREE', 'ATLAS_TLS11', 'ATLAS_TLS12'].map(
  name => {
    return {
      name,
      url: process.env[name]
    };
  }
);

function runConnectionTest(config) {
  const client = new MongoClient(config.url, {
    useNewUrlParser: true,
    // TODO: We should test both the unified and not-unified cases
    useUnifiedTopology: false
  });
  return Promise.resolve()
    .then(() => console.log(`testing ${config.name}`))
    .then(() => client.connect())
    .then(() => client.db('admin').command({ ismaster: 1 }))
    .then(() =>
      client
        .db('test')
        .collection('test')
        .findOne({})
    )
    .then(() => client.close())
    .then(() => console.log(`${config.name} passed`))
    .catch(e => {
      console.log(`${config.name} failed`);
      throw e;
    });
}

CONFIGS.reduce((p, config) => p.then(() => runConnectionTest(config)), Promise.resolve())
  .then(() => {
    console.log('all tests passed');
    process.exit(0);
  })
  .catch(() => {
    console.log('test failed');
    process.exit(1);
  });
