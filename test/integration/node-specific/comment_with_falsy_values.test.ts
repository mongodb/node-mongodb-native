import { expect } from 'chai';

import { Collection, Db } from '../../../src';
import { MongoClient } from '../../../src/mongo_client';

describe('comment option tests', function () {
  let client: MongoClient;
  let db: Db;
  let collection: Collection<{ _id: number }>;

  beforeEach(async function () {
    client = await this.configuration.newClient({ monitorCommands: true }).connect();
    db = client.db('comment_with_falsy_values');
    collection = db.collection<{ _id: number }>('test');
    await collection.insertMany([{ _id: 0 }]);
  });

  afterEach(async function () {
    await db.dropDatabase();
    await client.close();
  });

  it(`should allow falsy values for the comment field post 4.4`, async function () {
    let command = null;
    client.on('commandStarted', ({ command: _command }) => (command = _command));
    await collection.find({ _id: 0 }, { comment: 0 }).toArray();
    expect(command.comment).to.equal(0);
  });
});
