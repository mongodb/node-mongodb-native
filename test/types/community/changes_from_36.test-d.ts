/* eslint-disable @typescript-eslint/ban-types */
import type { PeerCertificate } from 'tls';
import { expectAssignable, expectError, expectNotType, expectType } from 'tsd';

import {
  MongoClient,
  type MongoClientOptions,
  type ReadPreference,
  type ReadPreferenceMode
} from '../../../src';
import type { PropExists } from '../utility_types';

type MongoDBImport = typeof import('../../../src');

const mongodb: MongoDBImport = null as unknown as MongoDBImport;

expectNotType<Function>(mongodb);
expectType<PropExists<MongoDBImport, 'connect'>>(false);

// MongoClientOptions
const options: MongoClientOptions = {};
// .readPreference no longer accepts boolean
expectNotType<boolean>(options.readPreference);
// .pkFactory cannot be an empty object
expectNotType<{}>(options.pkFactory);
// .checkServerIdentity cannot be `true`
expectNotType<true>(options.checkServerIdentity);

// Legacy option kept
expectType<PropExists<MongoClientOptions, 'w'>>(true);
// Removed options
expectType<PropExists<MongoClientOptions, 'wtimeout'>>(false);
expectType<PropExists<MongoClientOptions, 'j'>>(false);
expectType<PropExists<MongoClientOptions, 'bufferMaxEntries'>>(false);
expectType<PropExists<MongoClientOptions, 'poolSize'>>(false);
expectType<PropExists<MongoClientOptions, 'socketOptions'>>(false);
expectType<PropExists<MongoClientOptions, 'reconnectTries'>>(false);
expectType<PropExists<MongoClientOptions, 'reconnectInterval'>>(false);
expectType<PropExists<MongoClientOptions, 'compression'>>(false);
expectType<PropExists<MongoClientOptions, 'poolSize'>>(false);
expectType<PropExists<MongoClientOptions, 'minSize'>>(false);
expectType<PropExists<MongoClientOptions, 'socketOptions'>>(false);
expectType<PropExists<MongoClientOptions, 'reconnectTries'>>(false);
expectType<PropExists<MongoClientOptions, 'reconnectInterval'>>(false);
expectType<PropExists<MongoClientOptions, 'useNewUrlParser'>>(false);
expectType<PropExists<MongoClientOptions, 'useUnifiedTopology'>>(false);

expectType<string | undefined>(options.authSource);
expectType<ReadPreferenceMode | ReadPreference | undefined>(options.readPreference);
expectType<boolean | undefined>(options.promoteValues);
expectType<number | undefined>(options.family);
expectType<boolean | undefined>(options.ssl);
expectAssignable<((host: string, cert: PeerCertificate) => Error | undefined) | undefined>(
  options.checkServerIdentity
);

// compression options have simpler specification:
// old way: {compression: { compressors: ['zlib', 'snappy'] }}
expectType<PropExists<MongoClientOptions, 'compression'>>(false);
expectType<('none' | 'snappy' | 'zlib' | 'zstd')[] | string | undefined>(options.compressors);

// Removed cursor API
const cursor = new MongoClient('').db().aggregate();
expectType<PropExists<typeof cursor, 'maxScan'>>(false);
expectType<PropExists<typeof cursor, 'setCursorOption'>>(false);
expectType<PropExists<typeof cursor, 'setReadPreference'>>(false);
expectType<PropExists<typeof cursor, 'snapshot'>>(false);

// Cursor returning functions don't take a callback
const db = new MongoClient('').db();
const collection = db.collection('');
// collection.find
// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectError(collection.find({}, {}, (e: unknown, c: unknown) => undefined));
// collection.aggregate
// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectError(collection.aggregate({}, {}, (e: unknown, c: unknown) => undefined));
// db.aggregate
// eslint-disable-next-line @typescript-eslint/no-unused-vars
expectError(db.aggregate({}, {}, (e: unknown, c: unknown) => undefined));

// insertOne and insertMany doesn't return:
const insertOneRes = await collection.insertOne({});
const insertManyRes = await collection.insertOne({});
expectType<PropExists<typeof insertManyRes, 'ops'>>(false);
expectType<PropExists<typeof insertManyRes, 'result'>>(false);
expectType<PropExists<typeof insertOneRes, 'ops'>>(false);
expectType<PropExists<typeof insertOneRes, 'result'>>(false);
