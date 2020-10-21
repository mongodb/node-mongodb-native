'use strict';

const chai = require('chai');
const expect = chai.expect;
const { withClient } = require('../functional/shared');

// TODO: does this test no longer count as unit?
describe('Collection', function () {
  it('should not allow atomic operators for findOneAndReplace', {
    metadata: { requires: { topology: 'single' } },
    test: withClient((client, done) => {
      const db = client.db('fakeDb');
      const collection = db.collection('test');
      expect(() => {
        collection.findOneAndReplace({ a: 1 }, { $set: { a: 14 } });
      }).to.throw(/must not contain atomic operators/);
      done();
    })
  });
});
