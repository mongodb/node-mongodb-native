import { expectError, expectType } from 'tsd';

import { MongoClient } from '../../src/mongo_client';
import { ReadConcern, ReadConcernLevel } from '../../src/read_concern';
import type { ClientSession } from '../../src/sessions';

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
