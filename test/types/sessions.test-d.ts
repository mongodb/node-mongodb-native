import { expectError, expectType } from 'tsd';

import type { ClientSession } from '../mongodb';
import { MongoClient, ReadConcern, ReadConcernLevel } from '../mongodb';

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
