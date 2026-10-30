import { expect } from 'chai';

import { MongoClient } from '../mongodb';

describe('LDAP', function () {
  const { SASL_USER, SASL_PASS, SASL_HOST } = process.env;

  const MONGODB_URI = `mongodb://${SASL_USER}:${SASL_PASS}@${SASL_HOST}?authMechanism=plain&authSource=$external`;

  it('Should correctly authenticate against ldap', async function () {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    await client.db('ldap').collection('test').findOne();

    await client.close();
  });
});
