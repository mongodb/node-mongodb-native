'use strict';

const expect = require('chai').expect;
const MongoNetworkError = require('../../lib/core/error').MongoNetworkError;

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
});
