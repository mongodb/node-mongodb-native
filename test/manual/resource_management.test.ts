import { expect } from 'chai';
import * as sinon from 'sinon';

import { AbstractCursor, ChangeStream, ClientSession, MongoClient } from '../mongodb';

describe('Explicit Resource Management Tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });

  describe('Symbol.asyncDispose defined', function () {
    beforeEach(function () {
      if (!('asyncDispose' in Symbol)) {
        this.currentTest.skipReason = 'Test must run with asyncDispose available.';
        this.skip();
      }
    });

    describe('MongoClient', function () {
      it('closes the the client', async function () {
        client = new MongoClient('mongodb://localhost:27017');

        const spy = sinon.spy(client, 'close');
        await client[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });

    describe('ClientSession', function () {
      it('ends the session', async function () {
        client = new MongoClient('mongodb://localhost:27017');
        const session = client.startSession();

        const spy = sinon.spy(session, 'endSession');
        await session[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });

    describe('ChangeStreams', function () {
      it('closes the change stream', async function () {
        client = new MongoClient('mongodb://localhost:27017');
        const changeStream = client.watch();

        const spy = sinon.spy(changeStream, 'close');
        await changeStream[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });

    describe('cursors', function () {
      it('closes the cursor', async function () {
        client = new MongoClient('mongodb://localhost:27017');
        const cursor = client.db('foo').collection('bar').find();

        const spy = sinon.spy(cursor, 'close');
        await cursor[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });
  });

  describe('Symbol.asyncDispose not defined', function () {
    beforeEach(function () {
      if ('asyncDispose' in Symbol) {
        this.currentTest.skipReason = 'Test must run without asyncDispose available.';
        this.skip();
      }
    });

    it('does not define symbol.asyncDispose on MongoClient', function () {
      expect(MongoClient[Symbol.asyncDispose]).not.to.exist;
    });

    it('does not define symbol.asyncDispose on ClientSession', function () {
      expect(ClientSession[Symbol.asyncDispose]).not.to.exist;
    });

    it('does not define symbol.asyncDispose on ChangeStream', function () {
      expect(ChangeStream[Symbol.asyncDispose]).not.to.exist;
    });

    it('does not define symbol.asyncDispose on cursors', function () {
      expect(AbstractCursor[Symbol.asyncDispose]).not.to.exist;
    });
  });
});
