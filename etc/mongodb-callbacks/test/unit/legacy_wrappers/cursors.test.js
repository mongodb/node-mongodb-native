'use strict';

const { expect } = require('chai');
const { MongoClient, Collection, FindCursor } = require('../../../src');

// const commonAsyncCursorMethods = ['close', 'forEach', 'hasNext', 'next', 'toArray', 'tryNext'];

describe('legacy_wrappers/cursors.js', () => {
  let client;
  let db;
  let collection;

  beforeEach(() => {
    client = new MongoClient('mongodb://localhost');
    db = client.db('myDb');
    collection = db.collection('myCollection');
  });

  afterEach(async () => {
    await client.close();
  });

  it('should be a legacyCollection', () => {
    expect(collection).to.be.instanceOf(Collection);
  });

  it('should be a legacy find cursor', () => {
    expect(collection.find()).to.be.instanceOf(FindCursor);
  });

  it('should be able to run count with a callback', done => {
    const findCursor = collection.find();
    findCursor.count((err, res) => {
      try {
        expect(err).to.not.exist;
        expect(res).to.equal(0);
        done();
      } catch (assertionErr) {
        done(assertionErr);
      }
    });
  });

  it('should be able to run count and return a promise', async () => {
    const findCursor = collection.find();
    const res = await findCursor.count();
    expect(res).to.equal(0);
  });
});
