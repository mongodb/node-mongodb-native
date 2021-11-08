'use strict';

const { expect } = require('chai');
const { Long } = require('../../../src/bson');
const { GetMoreOperation } = require('../../../src/operations/get_more');

describe('GetMoreOperation', function () {
  describe('#constructor', function () {
    const ns = 'db.coll';
    const cursorId = Long.fromNumber(1);
    const options = { batchSize: 100, comment: 'test', maxTimeMS: 500 };
    const operation = new GetMoreOperation(ns, cursorId, options);

    it('sets the namespace', function () {
      expect(operation.ns).to.equal(ns);
    });

    it('sets the cursorId', function () {
      expect(operation.cursorId).to.equal(cursorId);
    });

    it('sets the options', function () {
      expect(operation.options).to.deep.equal(options);
    });
  });
});
