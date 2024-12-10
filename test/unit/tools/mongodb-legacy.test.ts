import { expect } from 'chai';

import {
  Admin,
  AggregationCursor,
  ChangeStream,
  ClientSession,
  Collection,
  Db,
  FindCursor,
  GridFSBucket,
  GridFSBucketWriteStream,
  ListCollectionsCursor,
  ListIndexesCursor,
  MongoClient,
  OrderedBulkOperation,
  UnorderedBulkOperation
} from '../../mongodb';

const classesWithAsyncAPIs = new Map<string, any>([
  ['Admin', Admin],
  ['FindCursor', FindCursor],
  ['ListCollectionsCursor', ListCollectionsCursor],
  ['ListIndexesCursor', ListIndexesCursor],
  ['AggregationCursor', AggregationCursor],
  ['ChangeStream', ChangeStream],
  ['Collection', Collection],
  ['Db', Db],
  ['GridFSBucket', GridFSBucket],
  ['ClientSession', ClientSession],
  ['GridFSBucketWriteStream', GridFSBucketWriteStream],
  ['OrderedBulkOperation', OrderedBulkOperation],
  ['UnorderedBulkOperation', UnorderedBulkOperation]
]);

describe('mongodb-legacy', () => {
  for (const [className, ctor] of classesWithAsyncAPIs) {
    it(`test suite imports a ${className} with the legacy symbol`, () => {
      // Just confirming that the mongodb-legacy import is correctly overriding the local copies
      // of these classes from "src". See test/mongodb.ts for more.
      expect(ctor.prototype).to.have.property(__callbacks.toLegacy);
    });
  }

  it('test suite imports a LegacyMongoClient as MongoClient', () => {
    // Just confirming that the mongodb-legacy import is correctly overriding the local copy
    // of MongoClient from "src". See test/mongodb.ts for more.
    expect(MongoClient).to.have.property('name', 'LegacyMongoClient');
  });
});
