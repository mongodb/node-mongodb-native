import { expect } from 'chai';
import * as sinon from 'sinon';

import { AbstractCursor, Collection, ConnectionPool, MongoClient } from '../../mongodb';
import { FailPoint, sleep } from '../../tools/utils';

const testMetadata: MongoDBMetadataUI = {
  requires: {
    topology: 'single',
    mongodb: '>=4.0.0'
  }
};

const loadBalancedTestMetadata: MongoDBMetadataUI = {
  requires: {
    topology: 'load-balanced',
    mongodb: '>=4.0.0'
  }
};

const enableFailPointCommand: FailPoint = {
  configureFailPoint: 'failCommand',
  mode: 'alwaysOn',
  data: {
    failCommands: ['insert', 'getMore', 'killCursors', 'find'],
    errorCode: 80
  }
};

const disableFailPointCommand: FailPoint = {
  configureFailPoint: 'failCommand',
  mode: 'off',
  data: {
    failCommands: ['insert', 'getMore', 'killCursors', 'find']
  }
};

describe('Server Operation Count Tests', function () {
  let client: MongoClient;
  let collection: Collection<{ count: number }>;
  let cursor: AbstractCursor;

  beforeEach(async function () {
    client = await this.configuration.newClient().connect();
    collection = client.db('server-selection-operation-count').collection('collection0');
    await collection.insertMany(
      Array.from({ length: 100 }, (_, i) => ({
        count: i
      }))
    );
  });

  afterEach(async function () {
    sinon.restore();
    await client.db('admin').command(disableFailPointCommand);
    await collection.deleteMany({});
    await client.close();
    client = undefined;
    collection = undefined;
    if (cursor) {
      await cursor.close();
      cursor = undefined;
    }
  });

  context('load balanced mode with pinnable operations', function () {
    it('is zero after a successful command', loadBalancedTestMetadata, async function () {
      const server = Array.from(client.topology.s.servers.values())[0];
      expect(server.s.operationCount).to.equal(0);
      const commandSpy = sinon.spy(server, 'command');

      await collection.findOne({ count: 1 });

      expect(commandSpy.called).to.be.true;
      expect(server.s.operationCount).to.equal(0);
    });

    it('is zero after a command fails', loadBalancedTestMetadata, async function () {
      await client.db('admin').command(enableFailPointCommand);

      const server = Array.from(client.topology.s.servers.values())[0];
      expect(server.s.operationCount).to.equal(0);

      const commandSpy = sinon.spy(server, 'command');

      const error = await collection.findOne({ count: 1 }).catch(e => e);

      expect(error).to.exist;
      expect(commandSpy.called).to.be.true;

      expect(server.s.operationCount).to.equal(0);
    });

    it(
      'is zero after failing to check out a connection for a command',
      loadBalancedTestMetadata,
      async function () {
        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);

        sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
          cb(new Error('unable to checkout connection'), undefined);
        });
        const commandSpy = sinon.spy(server, 'command');

        const error = await collection.findOne({ count: 1 }).catch(e => e);

        expect(error).to.exist;
        expect(error).to.match(/unable to checkout connection/i);
        expect(commandSpy.called).to.be.true;
        expect(server.s.operationCount).to.equal(0);
      }
    );
  });

  context('operationCount is adjusted properly on successful operation', function () {
    it('is zero after a successful command', testMetadata, async function () {
      const server = Array.from(client.topology.s.servers.values())[0];
      expect(server.s.operationCount).to.equal(0);
      const commandSpy = sinon.spy(server, 'command');

      const operationPromises = Array.from({ length: 10 }, () =>
        collection.insertOne({ count: 1 })
      );

      // operation count is incremented after connection checkout, which happens asynchronously (even though there are plenty of connections in the pool).
      // we sleep to give the event loop a turn so that all the commands check out a connection before asserting the operation count
      await sleep(1);

      expect(server.s.operationCount).to.equal(10);

      await Promise.all(operationPromises);

      expect(commandSpy.called).to.be.true;
      expect(server.s.operationCount).to.equal(0);
    });
  });

  context('operationCount is adjusted properly when operations fail', function () {
    it('is zero after a command fails', testMetadata, async function () {
      await client.db('admin').command(enableFailPointCommand);

      const server = Array.from(client.topology.s.servers.values())[0];
      expect(server.s.operationCount).to.equal(0);

      const commandSpy = sinon.spy(server, 'command');

      const error = await collection.insertOne({ count: 1 }).catch(e => e);

      expect(error).to.exist;
      expect(commandSpy.called).to.be.true;

      expect(server.s.operationCount).to.equal(0);
    });
  });

  context(
    'operationCount is decremented when the server fails to checkout a connection',
    function () {
      it(
        'is zero after failing to check out a connection for a command',
        testMetadata,
        async function () {
          const server = Array.from(client.topology.s.servers.values())[0];
          expect(server.s.operationCount).to.equal(0);

          sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
            cb(new Error('unable to checkout connection'), undefined);
          });
          const commandSpy = sinon.spy(server, 'command');

          const error = await collection.insertOne({ count: 1 }).catch(e => e);

          expect(error).to.exist;
          expect(error).to.match(/unable to checkout connection/i);
          expect(commandSpy.called).to.be.true;
          expect(server.s.operationCount).to.equal(0);
        }
      );
    }
  );
});
