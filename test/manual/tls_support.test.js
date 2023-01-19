'use strict';
const { MongoClient } = require('../mongodb');
const { LEGACY_HELLO_COMMAND } = require('../mongodb');

const REQUIRED_ENV = ['MONGODB_URI', 'SSL_KEY_FILE', 'SSL_CA_FILE'];

describe('TLS Support', function () {
  for (let key of REQUIRED_ENV) {
    if (process.env[key] == null) {
      throw new Error(`skipping SSL tests, ${key} environment variable is not defined`);
    }
  }

  const connectionString = process.env.MONGODB_URI;
  const tlsCertificateKeyFile = process.env.SSL_KEY_FILE;
  const tlsCAFile = process.env.SSL_CA_FILE;
  const tlsSettings = { tls: true, tlsCertificateKeyFile, tlsCAFile };

  it(
    'should connect with tls via client options',
    makeConnectionTest(connectionString, tlsSettings)
  );

  it(
    'should connect with tls via url options',
    makeConnectionTest(
      `${connectionString}?${Object.keys(tlsSettings)
        .map(key => `${key}=${tlsSettings[key]}`)
        .join('&')}`
    )
  );
});

function makeConnectionTest(connectionString, clientOptions) {
  return function () {
    const client = new MongoClient(connectionString, clientOptions);

    return client
      .connect()
      .then(() => client.db('admin').command({ [LEGACY_HELLO_COMMAND]: 1 }))
      .then(() => client.db('test').collection('test').findOne({}))
      .then(() => client.close());
  };
}
