import { expect } from 'chai';
import * as process from 'process';

import { MongoClient } from '../mongodb';

describe('LDAP', function () {
  const { SASL_USER, SASL_PASS, SASL_HOST_BUILD } = process.env;

  const MONGODB_URI = `mongodb://${SASL_USER}:${SASL_PASS}@${SASL_HOST_BUILD}?authMechanism=plain&authSource=$external`;

  it('Should correctly authenticate against ldap', async function () {
    const client = new MongoClient(MONGODB_URI);

    let thrown;
    try {
      await client.connect();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.not.exist;

    await client.close();
  });
});
