/* eslint-disable @typescript-eslint/no-empty-function */
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

// TODO(NODE-3348): Improve the tests to expectType assertions

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  db.collection('test_crud');
  // Let's close the db
  client.close();
});

export async function testFunc(): Promise<MongoClient> {
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
export function gridTest(bucket: GridFSBucket): void {
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  openUploadStream.abort((error, result) => {});
}

// Client-Side Field Level Encryption
const keyVaultNamespace = 'encryption.__keyVault';
new MongoClient(url, {
  monitorCommands: true,
  autoEncryption: {
    keyVaultNamespace,
    kmsProviders: {},
    schemaMap: {},
    extraOptions: {}
  }
});
