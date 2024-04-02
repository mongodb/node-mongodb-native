import { expect } from 'chai';

import { MongoAPIError, MongoClient } from '../../mongodb';

describe('class RunCommandCursor', () => {
  let client: MongoClient;

  beforeEach(async function () {
    client = new MongoClient('mongodb://iLoveJavascript');
  });

  context('constructor()', () => {
    it('freezes and stores the command on the cursor instance', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      expect(cursor).to.have.property('command').that.is.frozen;
    });

    it('creates getMoreOptions property with no defaults', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      expect(cursor).to.have.property('getMoreOptions').that.deep.equals({});
    });
  });

  context('setComment()', () => {
    it('stores the comment value in getMoreOptions', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      cursor.setComment('iLoveJS');
      expect(cursor).to.have.nested.property('getMoreOptions.comment', 'iLoveJS');
    });
  });

  context('setMaxTimeMS()', () => {
    it('stores the maxTimeMS value in getMoreOptions.maxAwaitTimeMS', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      cursor.setMaxTimeMS(2);
      expect(cursor).to.have.nested.property('getMoreOptions.maxAwaitTimeMS', 2);
    });

    it('does not validate maxTimeMS type', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      // @ts-expect-error: testing for incorrect type
      cursor.setMaxTimeMS('abc');
      expect(cursor).to.have.nested.property('getMoreOptions.maxAwaitTimeMS', 'abc');
    });
  });

  context('setBatchSize()', () => {
    it('stores the batchSize value in getMoreOptions', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      cursor.setBatchSize(2);
      expect(cursor).to.have.nested.property('getMoreOptions.batchSize', 2);
    });

    it('does not validate batchSize type', () => {
      const cursor = client.db().runCursorCommand({ a: 1 });
      // @ts-expect-error: testing for incorrect type
      cursor.setBatchSize('abc');
      expect(cursor).to.have.nested.property('getMoreOptions.batchSize', 'abc');
    });
  });

  context('Non applicable AbstractCursor methods', () => {
    it('withReadConcern throws', () => {
      expect(() =>
        client.db().runCursorCommand({ a: 1 }).withReadConcern({ level: 'local' })
      ).to.throw(MongoAPIError);
    });

    it('addCursorFlag throws', () => {
      expect(() => client.db().runCursorCommand({ a: 1 }).addCursorFlag('tailable', true)).to.throw(
        MongoAPIError
      );
    });

    it('maxTimeMS throws', () => {
      expect(() => client.db().runCursorCommand({ a: 1 }).maxTimeMS(2)).to.throw(MongoAPIError);
    });

    it('batchSize throws', () => {
      expect(() => client.db().runCursorCommand({ a: 1 }).batchSize(2)).to.throw(MongoAPIError);
    });

    it('clone throws', () => {
      expect(() => client.db().runCursorCommand({ a: 1 }).clone()).to.throw(MongoAPIError);
    });
  });
});
