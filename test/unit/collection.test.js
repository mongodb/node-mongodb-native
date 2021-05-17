'use strict';

const EventEmitter = require('events');
const chai = require('chai');
const expect = chai.expect;
const Db = require('../../lib/db');

class MockTopology extends EventEmitter {
  constructor() {
    super();
  }

  capabilities() {
    return {};
  }
}

describe('Collection', function() {
  describe('findOneAndReplace()', function() {
    it('should throw on atomic operators in replacement document', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const db = new Db('fakeDb', new MockTopology());
        const collection = db.collection('test');
        expect(() => {
          collection.findOneAndReplace({ a: 1 }, { $set: { a: 14 } });
        }).to.throw(/must not contain atomic operators/);
      }
    });

    it('should throw if returnOriginal is specified with returnDocument as an option', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const db = new Db('fakeDb', new MockTopology());
        const collection = db.collection('test');
        expect(() => {
          collection.findOneAndReplace(
            { a: 1 },
            { b: 2 },
            { returnOriginal: false, returnDocument: 'after' }
          );
        }).to.throw(/returnOriginal is deprecated in favor of returnDocument/);
      }
    });
  });

  describe('findOneAndUpdate()', function() {
    it('should throw if returnOriginal is specified with returnDocument as an option', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const db = new Db('fakeDb', new MockTopology());
        const collection = db.collection('test');
        expect(() => {
          collection.findOneAndUpdate(
            { a: 1 },
            { $set: { a: 14 } },
            { returnOriginal: true, returnDocument: 'before' }
          );
        }).to.throw(/returnOriginal is deprecated in favor of returnDocument/);
      }
    });
  });
});
