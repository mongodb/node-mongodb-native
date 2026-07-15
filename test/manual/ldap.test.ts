import { expect } from 'chai';
import * as process from 'process';

import { MongoClient } from '../mongodb';

describe('LDAP', function () {
  const { SASL_USER, SASL_PASS, SASL_HOST } = process.env;

  const MONGODB_URI = `mongodb://${SASL_USER}:${SASL_PASS}@${SASL_HOST}?authMechanism=plain&authSource=$external`;

  // Skipped while we await migration of the underlying environment variable to point at a
  // compatible server.
  beforeEach(function () {
    this.currentTest.skipReason =
      'Awaiting migration of the underlying env var to aim at a compatible server';
    this.skip();
  });

  it('Should correctly authenticate against ldap', async function () {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    const doc = await client.db('ldap').collection('test').findOne();
    expect(doc).property('ldap').to.equal(true);

    await client.close();
  });
});
