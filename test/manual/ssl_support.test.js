'use strict';
const { MongoClient } = require('../../src');

const REQUIRED_ENV = ['MONGODB_URI', 'SSL_KEY_FILE', 'SSL_CA_FILE'];

describe('SSL/TLS Support', function () {
  for (let key of REQUIRED_ENV) {
    if (process.env[key] == null) {
      throw new Error(`skipping SSL tests, ${key} environment variable is not defined`);
    }
  }

  const connectionString = process.env.MONGODB_URI;
  const tlsCertificateKeyFile = process.env.SSL_KEY_FILE;
  const tlsCAFile = process.env.SSL_CA_FILE;

  it(
    'should connect with tls',
    makeConnectionTest(connectionString, { tls: true, tlsCertificateKeyFile, tlsCAFile })
  );
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
