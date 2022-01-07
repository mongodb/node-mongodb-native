'use strict';
const { expect } = require('chai');

describe('Views', function () {
  let client, db;
  beforeEach(async function () {
    const configuration = this.configuration;
    client = this.configuration.newClient();
    await client.connect();
    db = client.db(configuration.db);
  });

  afterEach(async function () {
    await db.dropCollection('test');
    await client.close();
  });

  it('should successfully create a view on a collection', {
    metadata: { requires: { topology: 'single' } },

    async test() {
      const result = await db.createCollection('test', {
        viewOn: 'users',
        pipeline: [{ $match: {} }]
      });

      expect(result).to.exist;

      const newView = await db
        .listCollections({
          type: 'view',
          name: 'test'
        })
        .next();

      console.error(newView);

      expect(newView).to.exist;

      const options = newView.options;
      expect(options).to.haveOwnProperty('viewOn', 'users');
      expect(options)
        .to.haveOwnProperty('pipeline')
        .to.deep.equal([{ $match: {} }]);
    }
  });
});
