import { expect } from 'chai';
import * as process from 'process';

import { MongoClient } from '../../src';

describe('LDAP', function () {
  const { SASL_USER, SASL_PASS, SASL_HOST } = process.env;

  const MONGODB_URI = `mongodb://${SASL_USER}:${SASL_PASS}@${SASL_HOST}?authMechanism=plain&authSource=$external`;

  it('Should correctly authenticate against ldap', async function () {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    const doc = await client.db('ldap').collection('test').findOne();
    expect(doc).property('ldap').to.equal(true);

    await client.close();
  });
});
