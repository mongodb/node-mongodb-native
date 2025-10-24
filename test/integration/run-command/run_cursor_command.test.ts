import { expect } from 'chai';

import { type Db, type MongoClient } from '../../../src';

describe('runCursorCommand API', () => {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    client = this.configuration.newClient({}, { monitorCommands: true });
    db = client.db();
    await db.dropDatabase().catch(() => null);
    await db
      .collection<{ _id: number }>('collection')
      .insertMany([{ _id: 0 }, { _id: 1 }, { _id: 2 }]);
  });

  afterEach(async function () {
    await client.close();
  });

  it('returns each document only once across multiple iterators', async () => {
    const cursor = db.runCursorCommand({ find: 'collection', filter: {}, batchSize: 1 });
    cursor.setBatchSize(1);

    const a = cursor[Symbol.asyncIterator]();
    const b = cursor[Symbol.asyncIterator]();

    // Interleaving calls to A and B
    const results = [
      await a.next(), // find, first doc
      await b.next(), // getMore, second doc

      await a.next(), // getMore, third doc
      await b.next(), // getMore, no doc & exhausted id, a.k.a. done

      await a.next(), // done
      await b.next() // done
    ];

    expect(results).to.deep.equal([
      { value: { _id: 0 }, done: false },
      { value: { _id: 1 }, done: false },
      { value: { _id: 2 }, done: false },
      { value: undefined, done: true },
      { value: undefined, done: true },
      { value: undefined, done: true }
    ]);
  });
});
