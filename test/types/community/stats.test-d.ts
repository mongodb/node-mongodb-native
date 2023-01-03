import { expectType } from 'tsd';

import { CollStats, MongoClient } from '../../mongodb';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

expectType<CollStats>(await collection.stats());

const stats = await collection.stats();
if (stats.wiredTiger) {
  expectType<number>(stats.wiredTiger.cache['bytes currently in the cache']);
}
