import { expect } from 'chai';

import { type CollectionInfo, type Db, type MongoClient } from '../../../src';

describe('Views', function () {
  let client: MongoClient;
  let db: Db;

  beforeEach(async function () {
    const configuration = this.configuration;
    client = this.configuration.newClient();
    db = client.db(configuration.db);
  });

  afterEach(async function () {
    await db.dropCollection('test');
    await client.close();
  });

  it('should successfully create a view on a collection', async function () {
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

    expect(newView).to.exist;

    const options = (newView as CollectionInfo).options ?? null;
    expect(options).to.haveOwnProperty('viewOn', 'users');
    expect(options)
      .to.haveOwnProperty('pipeline')
      .to.deep.equal([{ $match: {} }]);
  });
});
