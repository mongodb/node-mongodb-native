import { expect } from 'chai';
import * as sinon from 'sinon';

import { type MongoClient } from '../../mongodb';

describe('Symbol.asyncDispose implementation tests', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client?.close();
  });

  describe('Symbol.asyncDispose defined', function () {
    describe('MongoClient', function () {
      it('the Symbol.asyncDispose method calls close()', async function () {
        client = this.configuration.newClient();

        const spy = sinon.spy(client, 'close');
        await client[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });

    describe('ClientSession', function () {
      it('the Symbol.asyncDispose method calls endSession()', async function () {
        client = this.configuration.newClient();
        const session = client.startSession();

        const spy = sinon.spy(session, 'endSession');
        await session[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });

    describe('ChangeStreams', function () {
      it('the Symbol.asyncDispose method calls close()', async function () {
        client = this.configuration.newClient();
        const changeStream = client.watch();

        const spy = sinon.spy(changeStream, 'close');
        await changeStream[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });

    describe('cursors', function () {
      it('the Symbol.asyncDispose method calls close()', async function () {
        client = this.configuration.newClient();
        const cursor = client.db('foo').collection('bar').find();

        const spy = sinon.spy(cursor, 'close');
        await cursor[Symbol.asyncDispose]();
        expect(spy.called).to.be.true;
      });
    });
  });
});
