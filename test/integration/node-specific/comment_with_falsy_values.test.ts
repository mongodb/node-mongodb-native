import { expect } from 'chai';

import { Collection, Db } from '../../../src';
import { MongoClient } from '../../../src/mongo_client';

describe('comment option w/ falsy values', function () {
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

  it(`should allow 0 for comment option`, {
    metadata: { requires: { mongodb: '>=4.4' } },
    test: async function () {
      let command = null;
      client.on('commandStarted', ({ command: _command }) => (command = _command));
      await collection.find({ _id: 0 }, { comment: 0 }).toArray();
      expect(command.comment).to.equal(0);
    }
  });

  it(`should allow the empty string ('') for comment option`, {
    metadata: { requires: { mongodb: '>=4.4' } },
    test: async function () {
      let command = null;
      client.on('commandStarted', ({ command: _command }) => (command = _command));
      await collection.find({ _id: 0 }, { comment: '' }).toArray();
      expect(command.comment).to.equal('');
    }
  });

  it(`should allow false for comment option`, {
    metadata: { requires: { mongodb: '>=4.4' } },
    test: async function () {
      let command = null;
      client.on('commandStarted', ({ command: _command }) => (command = _command));
      await collection.find({ _id: 0 }, { comment: false }).toArray();
      expect(command.comment).to.equal(false);
    }
  });
});
