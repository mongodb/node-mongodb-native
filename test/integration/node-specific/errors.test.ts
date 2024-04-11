import { expect } from 'chai';

import { type MongoClient, ReadPreference } from '../../mongodb';

describe('Error (Integration)', function () {
  context('when a server selection error is stringified', function () {
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
