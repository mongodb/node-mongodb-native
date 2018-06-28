'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;
const expect = require('chai').expect;
const MongoClient = require('../../lib/mongo_client');

describe('examples(causal-consistency):', function() {
  let client;
  let collection;
  let session;

  before(async function() {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function() {
    client = await MongoClient.connect(this.configuration.url());
    collection = client.db(this.configuration.db).collection('arrayFilterUpdateExample');
  });

  afterEach(async function() {
    if (session) {
      await session.endSession();
      session = undefined;
    }

    await client.close();
    client = undefined;
    collection = undefined;
  });

  it('CausalConsistency', {
    metadata: {
      requires: { topology: ['single'], mongodb: '>=3.6.0' },
      sessions: { skipLeakTests: true }
    },

    test: async function() {
      const session = client.startSession({ causalConsistency: true });

      collection.insertOne({ darmok: 'jalad' }, { session });
      collection.updateOne({ darmok: 'jalad' }, { $set: { darmok: 'tanagra' } }, { session });

      const results = await collection.find({}, { session }).toArray();

      expect(results).to.exist;
    }
  });
});
