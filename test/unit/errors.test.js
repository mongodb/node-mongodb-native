'use strict';

const expect = require('chai').expect;
const { getSymbolFrom } = require('../tools/utils');
const MongoNetworkError = require('../../src/error').MongoNetworkError;

describe('MongoErrors', function () {
  describe('MongoNetworkError', function () {
    it('should only define beforeHandshake symbol if boolean option passed in', function () {
      const errorWithOptionTrue = new MongoNetworkError('', { beforeHandshake: true });
      expect(getSymbolFrom(errorWithOptionTrue, 'beforeHandshake', false)).to.be.a('symbol');

      const errorWithOptionFalse = new MongoNetworkError('', { beforeHandshake: false });
      expect(getSymbolFrom(errorWithOptionFalse, 'beforeHandshake', false)).to.be.a('symbol');

      const errorWithBadOption = new MongoNetworkError('', { beforeHandshake: 'not boolean' });
      expect(getSymbolFrom(errorWithBadOption, 'beforeHandshake', false)).to.be.an('undefined');

      const errorWithoutOption = new MongoNetworkError('');
      expect(getSymbolFrom(errorWithoutOption, 'beforeHandshake', false)).to.be.an('undefined');
    });
  });
});
