import { expectType } from 'tsd';

import { Document, MongoClient } from '../../src';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

// Promise variant testing
expectType<Promise<Document[]>>(collection.indexes());
expectType<Promise<Document[]>>(collection.indexes({}));

// Explicit check for iterable result
for (const index of await collection.indexes()) {
  expectType<Document>(index);
}
