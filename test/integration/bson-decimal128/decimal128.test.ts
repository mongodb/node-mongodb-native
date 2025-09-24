import { expect } from 'chai';

import { type Collection, Decimal128, type MongoClient } from '../../../src';

describe('Decimal128', function () {
  let client: MongoClient;
  let collection: Collection;

  beforeEach(async function () {
    client = this.configuration.newClient();
    collection = client.db('decimal128').collection('decimal128');
  });

  afterEach(async function () {
    await client.close();
  });

  it('should correctly insert decimal128 value', async function () {
    const object = {
      id: 1,
      value: Decimal128.fromString('1.28')
    };
    await collection.insertOne(object);
    const doc = await collection.findOne({
      id: 1
    });

    expect(doc.value).to.be.instanceof(Decimal128);
    expect(doc.value.toString()).to.equal('1.28');
  });
});
