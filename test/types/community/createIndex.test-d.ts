import { expectType } from 'tsd';

import { type CreateIndexesOptions, type Document, MongoClient } from '../../mongodb';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

const options: CreateIndexesOptions = { partialFilterExpression: { rating: { $exists: 1 } } };
const indexName = collection.createIndex({}, options);

expectType<Promise<string>>(indexName);
expectType<Document | undefined>(options.partialFilterExpression);

// One
collection.createIndex('someKey');
collection.createIndex(['someKey', 1]);
collection.createIndex(new Map([['someKey', 1]]));
collection.createIndex({ a: 1, b: -1 });
collection.createIndex({ a: '2dsphere', b: -1 });
collection.createIndex({ a: 'hashed' });
// OrMore
collection.createIndex(['someKey']);
collection.createIndex([['someKey', 1]]);
collection.createIndex([new Map([['someKey', 1]])]);
collection.createIndex([{ a: 1, b: -1 }]);
collection.createIndex([
  { a: '2dsphere', b: -1 },
  { a: 'geoHaystack', b: 1 }
]);
collection.createIndex(['a', ['b', 1], { a: 'geoHaystack', b: 1 }, new Map([['someKey', 1]])]);
collection.createIndex([{ a: 'hashed' }]);

// @ts-expect-error: CreateIndexes now asserts the object value types as of NODE-3517
collection.createIndexes([{ key: { a: 34n } }]);
