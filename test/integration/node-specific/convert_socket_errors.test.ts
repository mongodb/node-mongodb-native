import { Duplex } from 'node:stream';

import { expect } from 'chai';
import * as sinon from 'sinon';

import { type Collection, type Document, type MongoClient, MongoNetworkError } from '../../mongodb';
import { Connection, ns } from '../../mongodb';
import { clearFailPoint, configureFailPoint } from '../../tools/utils';
import { filterForCommands } from '../shared';

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
    let collection: Collection<Document>;

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

  describe('when an error is thrown writing data to a socket', () => {
    let client: MongoClient;
    let collection: Collection<Document>;

    beforeEach(async function () {
      client = this.configuration.newClient({ monitorCommands: true });
      await client.connect();
      const db = client.db('closeConn');
      collection = db.collection('closeConn');
      await collection.deleteMany({});

      for (const [, server] of client.topology.s.servers) {
        //@ts-expect-error: private property
        for (const connection of server.pool.connections) {
          //@ts-expect-error: private property
          const socket = connection.socket;
          const stub = sinon.stub(socket, 'write').callsFake(function () {
            stub.restore();
            throw new Error('This socket has been ended by the other party');
          });
        }
      }
    });

    afterEach(async function () {
      sinon.restore();
      await client.close();
    });

    it('retries and succeeds', async () => {
      const commandSucceededEvents: string[] = [];
      const commandFailedEvents: string[] = [];
      const commandStartedEvents: string[] = [];

      client.on('commandStarted', filterForCommands('find', commandStartedEvents));
      client.on('commandSucceeded', filterForCommands('find', commandSucceededEvents));
      client.on('commandFailed', filterForCommands('find', commandFailedEvents));

      // call find, fail once, succeed on retry
      const item = await collection.findOne({});
      // check that we didn't find anything, as expected
      expect(item).to.be.null;
      // check that we have the expected command monitoring events
      expect(commandStartedEvents).to.have.length(2);
      expect(commandFailedEvents).to.have.length(1);
      expect(commandSucceededEvents).to.have.length(1);
    });
  });
});
