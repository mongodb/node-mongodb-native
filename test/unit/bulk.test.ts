import { expect } from 'chai';

import {
  DEFAULT_PK_FACTORY,
  MongoDBCollectionNamespace,
  OrderedBulkOperation,
  UnorderedBulkOperation
} from '../mongodb';

describe('Bulk Operation insertedIds', function () {
  function makeFakeCollection() {
    const topology = {
      lastHello() {
        return { maxBsonObjectSize: 16 * 1024 * 1024, maxWriteBatchSize: 1000 };
      },
      s: { options: {} }
    };
    const collection: any = {
      client: { topology },
      topology,
      db: { options: {} },
      bsonOptions: {},
      s: {
        namespace: new MongoDBCollectionNamespace('test', 'coll'),
        pkFactory: DEFAULT_PK_FACTORY,
        bsonOptions: {},
        collection: undefined
      }
    };
    collection.s.collection = collection;
    return collection;
  }

  function addMixedOperations(bulk: OrderedBulkOperation | UnorderedBulkOperation) {
    bulk.raw({ insertOne: { document: { _id: 'a', x: 1 } } });
    bulk.raw({ updateOne: { filter: { x: 1 }, update: { $set: { y: 2 } } } });
    bulk.raw({ insertOne: { document: { _id: 'b', x: 3 } } });
    bulk.raw({ deleteOne: { filter: { x: 3 } } });
    bulk.raw({ insertOne: { document: { _id: 'c', x: 5 } } });
  }

  it('ordered bulk keys insertedIds by the originating operation index', function () {
    const bulk = new OrderedBulkOperation(makeFakeCollection(), { ordered: true } as any);
    addMixedOperations(bulk);
    const insertedIds = (bulk as any).s.bulkResult.insertedIds;
    expect(insertedIds).to.deep.equal([
      { index: 0, _id: 'a' },
      { index: 2, _id: 'b' },
      { index: 4, _id: 'c' }
    ]);
  });

  it('unordered bulk keys insertedIds by the originating operation index', function () {
    const bulk = new UnorderedBulkOperation(makeFakeCollection(), { ordered: false } as any);
    addMixedOperations(bulk);
    const insertedIds = (bulk as any).s.bulkResult.insertedIds;
    expect(insertedIds).to.deep.equal([
      { index: 0, _id: 'a' },
      { index: 2, _id: 'b' },
      { index: 4, _id: 'c' }
    ]);
  });
});
