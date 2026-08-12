import { expect } from 'chai';

import {
  BASE_BACKOFF_MS,
  calculateBaseBackoffMS,
  Long,
  MongoNetworkError,
  MongoServerError
} from '../../mongodb';

describe('executeOperation() backoff', function () {
  describe('calculateBaseBackoffMS()', function () {
    const makeError = (response: Record<string, unknown>) =>
      new MongoServerError({ message: 'overloaded', ...response });

    context('when the error carries a positive baseBackoffMS', function () {
      it('uses the server-supplied value', function () {
        expect(calculateBaseBackoffMS(makeError({ baseBackoffMS: 50 }))).to.equal(50);
      });

      it('uses it when the server sent an int64 that was not promoted', function () {
        expect(calculateBaseBackoffMS(makeError({ baseBackoffMS: Long.fromNumber(50) }))).to.equal(
          50
        );
      });
    });

    context('when the error does not carry a usable baseBackoffMS', function () {
      it('falls back to the default when absent', function () {
        expect(calculateBaseBackoffMS(makeError({}))).to.equal(BASE_BACKOFF_MS);
      });

      it('falls back to the default when 0, which is how the server disables the behaviour', function () {
        expect(calculateBaseBackoffMS(makeError({ baseBackoffMS: 0 }))).to.equal(BASE_BACKOFF_MS);
      });

      it('falls back to the default when negative', function () {
        expect(calculateBaseBackoffMS(makeError({ baseBackoffMS: -1 }))).to.equal(BASE_BACKOFF_MS);
      });

      it('falls back to the default when not a number', function () {
        expect(calculateBaseBackoffMS(makeError({ baseBackoffMS: 'soon' }))).to.equal(
          BASE_BACKOFF_MS
        );
      });
    });

    context('when the error is not a server error', function () {
      it('falls back to the default', function () {
        // Overload errors raised during connection establishment carry the labels but no reply.
        expect(calculateBaseBackoffMS(new MongoNetworkError('connection reset'))).to.equal(
          BASE_BACKOFF_MS
        );
      });
    });
  });
});
