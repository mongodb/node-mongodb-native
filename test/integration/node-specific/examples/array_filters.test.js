'use strict';
const setupDatabase = require('../../shared').setupDatabase;

describe('examples(array filters):', function () {
  let client;
  let collection;

  before(async function () {
    await setupDatabase(this.configuration);
  });

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    collection = client.db(this.configuration.db).collection('arrayFilterUpdateExample');
  });

  afterEach(async function () {
    await client.close();
    client = undefined;
    collection = undefined;
  });

  it(
    'supports array filters when updating',
    { requires: { mongodb: '>=3.6.x', topology: ['single'] } },
    async function () {
      // 3. Exploiting the power of arrays
      await collection.updateOne(
        { _id: 1 },
        { $set: { 'a.$[i].b': 2 } },
        { arrayFilters: [{ 'i.b': 0 }] }
      );
    }
  );
});
