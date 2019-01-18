'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;
const MongoClient = require('../../lib/mongo_client');

describe('examples.runCommand:', function() {
  let client;
  let db;

  before(async function() {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function() {
    client = await MongoClient.connect(this.configuration.url());
    db = client.db(this.configuration.db);

    // Done to ensure existence of collection
    await db.collection('restaurants').insertOne({});
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
    db = undefined;
  });

  it('supports runCommand 1', {
    metadata: { requires: { topology: ['single'] } },
    test: async function() {
      // Start runCommand example 1
      await db.command({ buildInfo: 1 });
      // End runCommand example 1
    }
  });

  it('supports runCommand 2', {
    metadata: { requires: { topology: ['single'] } },
    test: async function() {
      // Start runCommand example 2
      await db.command({ collStats: 'restaurants' });
      // End runCommand example 2
    }
  });
});
