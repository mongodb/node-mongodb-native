import { expect } from 'chai';

import { MongoClient, MongoError, MongoServerSelectionError } from '../../mongodb';

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
      it(`constructs the message properly with an array of ${errors.length} errors`, () => {
        const error = new AggregateError(errors);
        const mongoError = new MongoError(message, { cause: error });

        expect(mongoError.message).to.equal(message);
      });
    }

    context('when the message on the AggregateError is non-empty', () => {
      it(`uses the AggregateError's message`, () => {
        const error = new AggregateError([new Error('non-empty')]);
        error.message = 'custom error message';
        const mongoError = new MongoError(error, { cause: error });
        expect(mongoError.message).to.equal('custom error message');
      });
    });

    it('sets the AggregateError to the cause property', () => {
      const error = new AggregateError([new Error('error 1')]);
      const mongoError = new MongoError(error, { cause: error });
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
});
