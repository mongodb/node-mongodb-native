/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
// Test source : https://github.com/mongodb/node-mongodb-native

import { expectType } from 'tsd';
import {
  GridFSBucket,
  MongoClient,
  MongoClientOptions,
  MongoError,
  MongoNetworkError,
  MongoParseError,
  ReadPreference,
  ReadPreferenceMode,
  W
} from '../../../src/index';

export const connectionString = 'mongodb://127.0.0.1:27017/test';

const options: MongoClientOptions = {
  authSource: ' ',
  loggerLevel: 'debug',
  w: 1,
  wtimeoutMS: 300,
  journal: true,
  readPreference: ReadPreference.NEAREST ?? 'secondaryPreferred',
  promoteValues: true,
  maxPoolSize: 1,
  family: 4,
  ssl: true,
  sslValidate: false,
  checkServerIdentity(host, cert) {
    return undefined;
  },
  promoteBuffers: false,
  authMechanism: 'SCRAM-SHA-1',
  forceServerObjectId: false,
  promiseLibrary: Promise,
  directConnection: false
};

MongoClient.connect(connectionString, options, (err, client?: MongoClient) => {
  if (err || !client) throw err;
  const db = client.db('test');
  const collection = db.collection('test_crud');
  // Let's close the db
  client.close();
});

async function testFunc(): Promise<MongoClient> {
  const testClient: MongoClient = await MongoClient.connect(connectionString);
  return testClient;
}

MongoClient.connect(connectionString, err => {
  if (err instanceof MongoError) {
    expectType<boolean>(err.hasErrorLabel('label'));
  }
});

expectType<Promise<MongoClient>>(MongoClient.connect(connectionString, options));

// TLS
const userName = '';
const password = '';
const url = `mongodb://${userName}:${password}@server:27017?authMechanism=MONGODB-X509&tls=true`;
const client = new MongoClient(url, {
  tls: true,
  tlsAllowInvalidHostnames: true,
  tlsCAFile: `${__dirname}/certs/ca.pem`,
  tlsCertificateKeyFile: `${__dirname}/certs/x509/client.pem`,
  tlsCertificateKeyFilePassword: '10gen'
});
expectType<ReadPreferenceMode>(client.readPreference.mode);
expectType<W | undefined>(client.writeConcern?.w);

// Test other error classes
new MongoNetworkError('network error');
new MongoParseError('parse error');

// Streams
const gridFSBucketTests = (bucket: GridFSBucket) => {
  const openUploadStream = bucket.openUploadStream('file.dat');
  openUploadStream.on('close', () => {});
  openUploadStream.on('end', () => {});
  expectType<Promise<void>>(openUploadStream.abort()); // $ExpectType void
  expectType<void>(
    openUploadStream.abort(() => {
      openUploadStream.removeAllListeners();
    })
  );
  openUploadStream.abort(error => {
    error; // $ExpectType MongoError
  });
  openUploadStream.abort((error, result) => {});
};

// Client-Side Field Level Encryption
const keyVaultNamespace = 'encryption.__keyVault';
const secureClient = new MongoClient(url, {
  monitorCommands: true,
  autoEncryption: {
    keyVaultNamespace,
    kmsProviders: {},
    schemaMap: {},
    extraOptions: {}
  }
});
