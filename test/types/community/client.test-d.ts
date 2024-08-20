import { expectType } from 'tsd';

import {
  type GridFSBucket,
  MongoClient,
  type MongoClientOptions,
  MongoNetworkError,
  MongoParseError,
  ReadPreference,
  type ReadPreferenceMode,
  type W
} from '../../mongodb';

// TODO(NODE-3348): Improve the tests to expectType assertions

export const connectionString = 'mongodb://127.0.0.1:27017/test';

const options: MongoClientOptions = {
  authSource: ' ',
  w: 1,
  wtimeoutMS: 300,
  journal: true,
  readPreference: ReadPreference.NEAREST ?? 'secondaryPreferred',
  promoteValues: true,
  maxPoolSize: 1,
  family: 4,
  ssl: true,
  tlsAllowInvalidCertificates: false,
  checkServerIdentity(host, cert) {
    return undefined;
  },
  promoteBuffers: false,
  authMechanism: 'SCRAM-SHA-1',
  forceServerObjectId: false,
  directConnection: false
};

export async function testFunc(): Promise<MongoClient> {
  const testClient: MongoClient = await MongoClient.connect(connectionString);
  return testClient;
}

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
