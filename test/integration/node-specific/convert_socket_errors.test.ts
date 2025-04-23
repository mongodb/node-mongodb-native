import { Duplex } from 'node:stream';

import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, type MongoClient, MongoNetworkError, ns } from '../../mongodb';
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
