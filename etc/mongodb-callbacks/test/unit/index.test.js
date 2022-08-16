'use strict';

const { expect } = require('chai');
const mdbLegacy = require('../../src/index');
const mdb = require('mongodb');

const classesWithAsyncAPIs = new Set([
  'Admin',
  'AggregationCursor',
  'FindCursor',
  'ListCollectionsCursor',
  'ListIndexesCursor',
  'AggregationCursor',
  'ChangeStream',
  'Collection',
  'Db',
  'GridFSBucket',
  'MongoClient'
]);

describe('index.js', () => {
  it('should export everything mongodb does', () => {
    expect(mdbLegacy).to.have.all.keys(Object.keys(mdb));
  });

  describe('subclass for legacy callback support', () => {
    for (const classWithAsyncAPI of classesWithAsyncAPIs) {
      it(`should export ${classWithAsyncAPI} as a subclass of mdb.${classWithAsyncAPI}`, () => {
        expect(mdbLegacy[classWithAsyncAPI]).to.have.property('prototype');
        expect(mdbLegacy[classWithAsyncAPI].prototype).to.be.instanceOf(mdb[classWithAsyncAPI]);
      });
    }
  });
});
