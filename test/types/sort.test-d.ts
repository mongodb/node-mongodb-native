import { expectError } from 'tsd';

import {
  type Collection,
  type GridFSBucket,
  type MongoClient,
  ObjectId,
  type Sort
} from '../mongodb';

const sortFieldName: Sort = 'a';
const sortFieldNameObject: Sort = { a: 1, b: -1 };
const sortFieldNameList: Sort = ['a', 'b'];
const sortFieldNameTuple: Sort = ['a', 1];
const sortFieldNameTuples: Sort = [
  ['a', 1],
  ['b', -1]
];
const sortFieldNameMap: Sort = new Map([
  ['a', 1],
  ['b', -1]
]);

const sorts = [
  // field names
  'a',
  'b',

  // sort object
  { a: 1, b: -1 } as const,
  { a: 'ascending', b: 'ascending' } as const,
  { a: 'asc', b: 'desc' } as const,
  { a: 1, b: { $meta: 'textScore' } } as const,

  // field name list
  ['a', 'b'],
  ['a'],

  // field name to sort direction tuple
  ['a', 1] as const,
  ['a', -1] as const,
  ['a', 'asc'] as const,
  ['a', 'desc'] as const,
  ['a', 'ascending'] as const,
  ['a', 'descending'] as const,
  ['a', { $meta: 'textScore' }] as const,

  // field name to sort direction tuples
  [
    ['a', 1],
    ['b', -1]
  ] as const,
  [
    ['a', 'ascending'],
    ['b', 'ascending']
  ] as const,
  [
    ['a', 'asc'],
    ['b', 'desc']
  ] as const,
  [
    ['a', 1],
    ['b', { $meta: 'textScore' }]
  ] as const,

  // field name to sort direction map
  new Map().set('a', 1).set('b', -1),
  new Map().set('a', 'ascending').set('b', 'ascending'),
  new Map().set('a', 'asc').set('b', 'desc'),
  new Map().set('a', 1).set('b', { $meta: 'textScore' })
];

declare const bucket: GridFSBucket;
declare const collection: Collection;
declare const client: MongoClient;
declare const anyIndex: number;
const sort = sorts[anyIndex];

collection.findOne({}, { sort });
collection.find({}, { sort });
collection.find({}).sort(sort);

collection.aggregate([]).sort(sort);

collection.findOneAndDelete({}, { sort });
collection.findOneAndReplace({}, { sort });
collection.findOneAndUpdate({}, { sort });

bucket.openDownloadStream(new ObjectId(), { sort });
bucket.openDownloadStreamByName('', { sort });

collection.updateOne({}, {}, { sort });
collection.replaceOne({}, {}, { sort });

collection.bulkWrite([{ updateOne: { filter: {}, update: {}, sort } }]);
collection.bulkWrite([{ replaceOne: { filter: {}, replacement: {}, sort } }]);

client.bulkWrite([
  { name: 'updateOne', namespace: 'blah', filter: {}, update: {}, sort },
  { name: 'replaceOne', namespace: 'blah', filter: {}, replacement: {}, sort }
]);

// UpdateMany does not support sort
expectError(collection.updateMany({}, {}, { sort }));
expectError(
  client.bulkWrite([{ name: 'updateMany', namespace: 'blah', filter: {}, update: {}, sort }])
);
expectError(collection.bulkWrite([{ updateMany: { filter: {}, update: {}, sort } }]));
