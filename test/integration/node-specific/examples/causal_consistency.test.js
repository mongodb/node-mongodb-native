'use strict';

const setupDatabase = require('../../shared').setupDatabase;
const expect = require('chai').expect;

describe('examples(causal-consistency):', function () {
  let client;
  let collection;
  let session;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    collection = client.db(this.configuration.db).collection('arrayFilterUpdateExample');
  });

  afterEach(async function () {
    if (session) {
      await session.endSession();
      session = undefined;
    }

    await client.close();
    client = undefined;
    collection = undefined;
  });

  it('supports causal consistency', async function () {
    const session = client.startSession({ causalConsistency: true });

    await collection.insertOne({ darmok: 'jalad' }, { session });
    await collection.updateOne({ darmok: 'jalad' }, { $set: { darmok: 'tanagra' } }, { session });

    const results = await collection.find({}, { session }).toArray();

    expect(results).to.exist;

    await session.endSession();
  });
});
