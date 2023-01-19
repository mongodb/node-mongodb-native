import { expect } from 'chai';

import type { MongoClient } from '../../mongodb';

describe('SCRAM-SHA-1', function () {
  let client: MongoClient;

  beforeEach(async function () {
    const onlyScram1AuthMech =
      this.configuration.parameters?.authenticationMechanisms.length === 1 &&
      this.configuration.parameters?.authenticationMechanisms[0] === 'SCRAM-SHA-1';

    if (!onlyScram1AuthMech) {
      this.currentTest.skipReason = `MongoDB auth mechanism must only be SCRAM-SHA-1, got ${this.configuration.parameters?.authenticationMechanisms}`;
      return this.skip();
    }

    client = this.configuration.newClient();
  });

  afterEach(async () => {
    await client?.close();
  });

  it('successfuly authenticates', async () => {
    const result = await client.db().admin().command({ ping: 1 });
    expect(result).to.have.property('ok', 1);
  });
});
