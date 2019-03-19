'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;

describe('examples.createIndex:', function() {
  let client;
  let collection;

  before(async function() {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function() {
    client = await this.configuration.newClient().connect();
    collection = client.db(this.configuration.db).collection('createIndexExample');
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
    collection = undefined;
  });

  it('supports building simple ascending index', {
    metadata: { requires: { topology: ['single'] } },
    test: async function() {
      // Start createIndex example 1
      await collection.createIndex({ score: 1 });
      // End createIndex example 1
    }
  });

  it('supports building multikey index with partial filter expression', {
    metadata: { requires: { topology: ['single'], mongodb: '>=3.2.x' } },
    test: async function() {
      // Start createIndex example 2
      await collection.createIndex(
        { cuisine: 1, name: 1 },
        { partialFilterExpression: { rating: { $gt: 5 } } }
      );
      // End createIndex example 2
    }
  });
});
