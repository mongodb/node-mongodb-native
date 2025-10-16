import { once } from 'events';
import { expectType } from 'tsd';

import { type ConnectionPoolCreatedEvent, MongoClient } from '../../src';

const client: MongoClient = new MongoClient('');
const p = once(client, 'connectionPoolCreated');
await client.connect();

const ev: ConnectionPoolCreatedEvent = (await p)[0];
expectType<ConnectionPoolCreatedEvent>(ev);

expectType<{
  maxPoolSize: number;
  minPoolSize: number;
  maxConnecting: number;
  maxIdleTimeMS: number;
  waitQueueTimeoutMS: number;
}>(ev.options);
