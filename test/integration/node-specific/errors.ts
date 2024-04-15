import { expect } from 'chai';

import { MongoClient, MongoError, MongoServerSelectionError, ReadPreference } from '../../mongodb';

describe('Error (Integration)', function () {
  describe('AggregateErrors', function () {
    for (const { errors, message } of [
      {
        errors: [],
        message:
          'AggregateError has an empty errors array. Please check the `cause` property for more information.'
      },
      { errors: [new Error('message 1')], message: 'message 1' },
      {
        errors: [new Error('message 1'), new Error('message 2')],
        message: 'message 1, message 2'
      }
    ]) {
      it(
        `constructs the message properly with an array of ${errors.length} errors`,
        { requires: { nodejs: '>=16' } },
        () => {
          const error = new AggregateError(errors);
          const mongoError = new MongoError(error);

          expect(mongoError.message).to.equal(message);
        }
      );
    }

    context('when the message on the AggregateError is non-empty', () => {
      it(`uses the AggregateError's message`, { requires: { nodejs: '>=16' } }, () => {
        const error = new AggregateError([new Error('non-empty')]);
        error.message = 'custom error message';
        const mongoError = new MongoError(error);
        expect(mongoError.message).to.equal('custom error message');
      });
    });

    it('sets the AggregateError to the cause property', { requires: { nodejs: '>=16' } }, () => {
      const error = new AggregateError([new Error('error 1')]);
      const mongoError = new MongoError(error);
      expect(mongoError.cause).to.equal(error);
    });
  });

  it('NODE-5296: handles aggregate errors from dns lookup', async function () {
    const error = await MongoClient.connect('mongodb://localhost:27222', {
      serverSelectionTimeoutMS: 1000
    }).catch(e => e);
    expect(error).to.be.instanceOf(MongoServerSelectionError);
    expect(error.message).not.to.be.empty;
  });

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
