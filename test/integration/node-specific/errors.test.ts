import { expect } from 'chai';

import { MongoClient, MongoServerSelectionError, ReadPreference } from '../../mongodb';

describe('Error (Integration)', function () {
  it('NODE-5296: handles aggregate errors from dns lookup', async function () {
    const error = await MongoClient.connect('mongodb://localhost:27222', {
      serverSelectionTimeoutMS: 1000
    }).catch(e => e);
    expect(error).to.be.instanceOf(MongoServerSelectionError);
    expect(error.message).not.to.be.empty;
  });

  describe('when a server selection error is stringified', function () {
    it(
      'the error"s topology description correctly displays the `servers`',
      { requires: { topology: 'replicaset' } },
      async function () {
        const client: MongoClient = this.configuration.newClient({
          serverSelectionTimeoutMS: 1000
        });
        try {
          await client.connect();
          const error = await client
            .db('foo')
            .collection('bar')
            .find(
              {},
              {
                // Use meaningless read preference tags to ensure that the server selection fails
                readPreference: new ReadPreference('secondary', [{ ny: 'ny' }])
              }
            )
            .toArray()
            .catch(e => JSON.parse(JSON.stringify(e)));
          const servers = error.reason.servers;
          expect(Object.keys(servers).length > 0).to.be.true;
        } finally {
          await client.close();
        }
      }
    );
  });
});
