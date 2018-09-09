'use strict';

const setupDatabase = require('../functional/shared').setupDatabase;

describe('examples(project-fields-from-query):', function() {
  let client;
  let collection;

  before(async function() {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function() {
    client = this.configuration.newClient();
    await client.connect();
    collection = client.db(this.configuration.db).collection('arrayFilterUpdateExample');
  });

  afterEach(async function() {
    await client.close();
    client = undefined;
    collection = undefined;
  });

  it('supports array filters when updating', {
    metadata: { requires: { mongodb: '>=3.6.x', topology: ['single'] } },
    test: async function() {
      // 3. Exploiting the power of arrays
      await collection.updateOne(
        { _id: 1 },
        { $set: { 'a.$[i].b': 2 } },
        { arrayFilters: [{ 'i.b': 0 }] }
      );
    }
  });
});
