import { expectError } from 'tsd';

import { MongoClient, ObjectId } from '../../../mongodb';

// test collection.replaceX functions
const client = new MongoClient('');
const db = client.db('test');

interface TestModel {
  _id: ObjectId;
  stringField: string;
}

const collection = db.collection<TestModel>('testCollection');

// should accept a replacement doc without an _id
await collection.replaceOne({}, { stringField: 'b' });

// should not accept a literal replacement doc with an _id
expectError(await collection.replaceOne({}, { _id: new ObjectId(), stringField: 'a' }));
