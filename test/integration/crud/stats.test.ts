import { expect } from 'chai';

describe('stats', function () {
  it('correctly executes stats()', async function () {
    const client = this.configuration.newClient();
    await client.connect();
    const stats = await client.db('foo').stats();
    expect(stats).not.to.be.null;
    await client.close();
  });
});
