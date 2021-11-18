'use strict';

const expect = require('chai').expect;
const MongoNetworkError = require('../../lib/core/error').MongoNetworkError;
const isRetryableEndTransactionError = require('../../lib/core/error')
  .isRetryableEndTransactionError;

describe('MongoErrors', function() {
  describe('MongoNetworkError', function() {
    it('should only define beforeHandshake symbol if boolean option passed in', function() {
      const errorWithOptionTrue = new MongoNetworkError('', { beforeHandshake: true });
      expect(Object.getOwnPropertySymbols(errorWithOptionTrue).length).to.equal(1);

      const errorWithOptionFalse = new MongoNetworkError('', { beforeHandshake: false });
      expect(Object.getOwnPropertySymbols(errorWithOptionFalse).length).to.equal(1);

      const errorWithBadOption = new MongoNetworkError('', { beforeHandshake: 'not boolean' });
      expect(Object.getOwnPropertySymbols(errorWithBadOption).length).to.equal(0);

      const errorWithoutOption = new MongoNetworkError('');
      expect(Object.getOwnPropertySymbols(errorWithoutOption).length).to.equal(0);
    });
  });

  describe('#isRetryableEndTransactionError', function() {
    context('when the error has a RetryableWriteError label', function() {
      const error = new MongoNetworkError('');
      error.addErrorLabel('RetryableWriteError');

      it('returns true', function() {
        expect(isRetryableEndTransactionError(error)).to.be.true;
      });
    });

    context('when the error does not have a RetryableWriteError label', function() {
      const error = new MongoNetworkError('');
      error.addErrorLabel('InvalidLabel');

      it('returns false', function() {
        expect(isRetryableEndTransactionError(error)).to.be.false;
      });
    });

    context('when the error does not have any label', function() {
      const error = new MongoNetworkError('');

      it('returns false', function() {
        expect(isRetryableEndTransactionError(error)).to.be.false;
      });
    });
  });
});
