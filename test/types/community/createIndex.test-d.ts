import { expectType } from 'tsd';
import { CreateIndexesOptions, MongoClient, Document } from '../../../src';

const client = new MongoClient('');
const db = client.db('test');
const collection = db.collection('test.find');

const options: CreateIndexesOptions = { partialFilterExpression: { rating: { $exists: 1 } } };
const indexName = collection.createIndex({}, options);

expectType<Promise<string>>(indexName);
expectType<Document | undefined>(options.partialFilterExpression);
