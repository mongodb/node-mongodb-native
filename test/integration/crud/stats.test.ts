import { expect } from 'chai';

import { type MongoClient } from '../../../src';

describe('stats', function () {
  let client: MongoClient;

  beforeEach(async function () {
    client = this.configuration.newClient();
    await client.connect();
  });

  afterEach(async function () {
    await client.close();
  });

  it('correctly executes stats()', async function () {
    const stats = await client.db('foo').stats();
    expect(stats).not.to.be.null;
  });
});
