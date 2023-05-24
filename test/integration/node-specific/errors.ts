import { expect } from 'chai';
import { inspect } from 'util';

import { MongoClient, MongoError } from '../../mongodb';

describe('Error (Integration)', function () {
  describe('AggregateErrors', function () {
    it('constructs the message properly', { requires: { nodejs: '>=16' } }, () => {
      for (const { errors, message } of [
        { errors: [], message: 'Aggregate Error: ' },
        { errors: [new Error('message 1')], message: 'Aggregate Error: message 1' },
        {
          errors: [new Error('message 1'), new Error('message 2')],
          message: 'Aggregate Error: message 1, message 2'
        }
      ]) {
        const error = new AggregateError(errors);
        const mongoError = new MongoError(error);

        expect(
          mongoError.message,
          `built the message properly with an array of ${errors.length} errors`
        ).to.equal(message);
      }
    });

    it('sets the aggregate error to the cause property', { requires: { nodejs: '>=16' } }, () => {
      const error = new AggregateError([new Error('error 1')]);
      const mongoError = new MongoError(error);
      expect(mongoError.cause).to.equal(error);
    });
  });

  it('NODE-5296: handles aggregate errors from dns lookup', async function () {
    const error = await MongoClient.connect('mongodb://localhost:27222', {
      serverSelectionTimeoutMS: 1000
    }).catch(e => e);
    expect(error).to.be.instanceOf(Error);
    expect(error.message).not.to.be.empty;
  });
});
