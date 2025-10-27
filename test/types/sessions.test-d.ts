import { expectAssignable, expectError, expectType } from 'tsd';

import {
  type Binary,
  type ClientSession,
  type ClusterTime,
  type Long,
  MongoClient,
  ReadConcern,
  ReadConcernLevel,
  type Timestamp
} from '../../src';

// test mapped cursor types
const client = new MongoClient('');
// should allow ReadConcern or ReadConcernLike as readConcern in defaultTransactionOptions
expectType<ClientSession>(
  client.startSession({ defaultTransactionOptions: { readConcern: { level: 'snapshot' } } })
);
expectType<ClientSession>(
  client.startSession({
    defaultTransactionOptions: { readConcern: new ReadConcern(ReadConcernLevel.local) }
  })
);
expectError(client.startSession({ defaultTransactionOptions: { readConcern: 1 } }));

let something: any;
expectType<number>(await client.withSession(async () => 2));
expectType<string>(await client.withSession<string>(async () => something));
const untypedFn: any = () => 2;
expectType<any>(await client.withSession(untypedFn));
const unknownFn: () => Promise<unknown> = async () => 2;
expectType<unknown>(await client.withSession(unknownFn));
// Not a promise returning function
expectError(await client.withSession(() => null));

declare const ct: ClusterTime;
expectType<Timestamp>(ct.clusterTime);
expectAssignable<ClusterTime['signature']>(undefined);
expectType<Binary | undefined>(ct.signature?.hash);
expectType<Long | undefined>(ct.signature?.keyId);
