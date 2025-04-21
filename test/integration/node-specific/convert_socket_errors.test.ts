import { Duplex } from 'node:stream';

import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, ConnectionPool, type MongoClient, MongoNetworkError, ns } from '../../mongodb';
import { clearFailPoint, configureFailPoint } from '../../tools/utils';

describe('Socket Errors', () => {
  describe('when a socket emits an error', () => {
    it('command throws a MongoNetworkError', async () => {
      const socket = new Duplex();
      // @ts-expect-error: not a real socket
      const connection = new Connection(socket, {});
      const testError = new Error('blah');
      socket.emit('error', testError);
      const commandRes = connection.command(ns('a.b'), { ping: 1 }, {});

      const error = await commandRes.catch(error => error);
      expect(error).to.be.instanceOf(MongoNetworkError);
      expect(error.cause).to.equal(testError);
    });
  });

  describe('when the sized message stream emits an error', () => {
    it('command throws the same error', async () => {
      const socket = new Duplex();
      // @ts-expect-error: not a real socket
      const connection = new Connection(socket, {});
      const testError = new Error('blah');
      // @ts-expect-error: private field
      connection.messageStream.emit('error', testError);
      const commandRes = connection.command(ns('a.b'), { ping: 1 }, {});

      const error = await commandRes.catch(error => error);
      expect(error).to.equal(testError);
    });
  });

  describe('when destroyed after write', () => {
    let client: MongoClient;
    let collection;

    beforeEach(async function () {
      client = this.configuration.newClient({}, { appName: 'failInserts' });
      await client.connect();
      const db = client.db('closeConn');
      collection = db.collection('closeConn');

      const checkOut = sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(fakeCheckout);
      async function fakeCheckout(...args) {
        const connection = await checkOut.wrappedMethod.call(this, ...args);

        const write = sinon.stub(connection.socket, 'write').callsFake(function (...args) {
          queueMicrotask(() => {
            this.destroy(new Error('read ECONNRESET'));
          });
          return write.wrappedMethod.call(this, ...args);
        });

        return connection;
      }
    });

    afterEach(async function () {
      sinon.restore();
      await client.close();
    });

    it('throws a MongoNetworkError', async () => {
      const error = await collection.insertOne({ name: 'test' }).catch(error => error);
      expect(error).to.be.instanceOf(MongoNetworkError);
    });
  });

  describe('when destroyed after read', () => {
    let client: MongoClient;
    let collection;

    const metadata: MongoDBMetadataUI = { requires: { mongodb: '>=4.4' } };

    beforeEach(async function () {
      if (!this.configuration.filters.NodeVersionFilter.filter({ metadata })) {
        return;
      }

      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          appName: 'failInserts',
          failCommands: ['insert'],
          blockConnection: true,
          blockTimeMS: 1000 // just so the server doesn't reply super fast.
        }
      });

      client = this.configuration.newClient({}, { appName: 'failInserts' });
      await client.connect();
      const db = client.db('closeConn');
      collection = db.collection('closeConn');

      const checkOut = sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(fakeCheckout);
      async function fakeCheckout(...args) {
        const connection = await checkOut.wrappedMethod.call(this, ...args);

        const on = sinon.stub(connection.messageStream, 'on').callsFake(function (...args) {
          if (args[0] === 'data') {
            queueMicrotask(() => {
              connection.socket.destroy(new Error('read ECONNRESET'));
            });
          }
          return on.wrappedMethod.call(this, ...args);
        });

        return connection;
      }
    });

    afterEach(async function () {
      sinon.restore();
      await clearFailPoint(this.configuration);
      await client.close();
    });

    it('throws a MongoNetworkError', metadata, async () => {
      const error = await collection.insertOne({ name: 'test' }).catch(error => error);
      expect(error).to.be.instanceOf(MongoNetworkError);
    });
  });

  describe('when destroyed by failpoint', () => {
    let client: MongoClient;
    let collection;

    const metadata: MongoDBMetadataUI = { requires: { mongodb: '>=4.4' } };

    beforeEach(async function () {
      if (!this.configuration.filters.NodeVersionFilter.filter({ metadata })) {
        return;
      }

      await configureFailPoint(this.configuration, {
        configureFailPoint: 'failCommand',
        mode: 'alwaysOn',
        data: {
          appName: 'failInserts2',
          failCommands: ['insert'],
          closeConnection: true
        }
      });

      client = this.configuration.newClient({}, { appName: 'failInserts2' });
      await client.connect();
      const db = client.db('closeConn');
      collection = db.collection('closeConn');
    });

    afterEach(async function () {
      sinon.restore();
      await clearFailPoint(this.configuration);
      await client.close();
    });

    it('throws a MongoNetworkError', metadata, async () => {
      const error = await collection.insertOne({ name: 'test' }).catch(error => error);
      expect(error, error.stack).to.be.instanceOf(MongoNetworkError);
    });
  });
});
