import { expectType } from 'tsd';

import { MongoClient } from '../../src';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

// Promise variant testing
expectType<Promise<string>>(
  collection.createSearchIndex({
    name: 'test-index',
    definition: { mappings: { dynamic: false, fields: { description: { type: 'string' } } } }
  })
);

// Explicit check for iterable result
for (const indexName of await collection.createSearchIndexes([
  {
    name: 'test-index',
    definition: { mappings: { dynamic: false, fields: { description: { type: 'string' } } } }
  }
])) {
  expectType<string>(indexName);
}
