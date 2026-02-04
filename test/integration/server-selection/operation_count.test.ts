import { expect } from 'chai';
import * as sinon from 'sinon';

import { type AbstractCursor, type Collection, type MongoClient } from '../../mongodb';
import { ConnectionPool } from '../../mongodb';
import { type FailCommandFailPoint } from '../../tools/utils';

const testMetadata: MongoDBMetadataUI = {
  requires: {
    topology: 'single'
  }
};

const loadBalancedTestMetadata: MongoDBMetadataUI = {
  requires: {
    topology: 'load-balanced'
  }
};

const enableFailPointCommand: FailCommandFailPoint = {
  configureFailPoint: 'failCommand',
  mode: 'alwaysOn',
  data: {
    failCommands: ['insert', 'getMore', 'killCursors', 'find'],
    errorCode: 80
  }
};

const disableFailPointCommand: FailCommandFailPoint = {
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

        sinon
          .stub(ConnectionPool.prototype, 'checkOut')
          .rejects(new Error('unable to checkout connection'));
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
      const incrementSpy = sinon.spy(server, 'incrementOperationCount');
      const decrementSpy = sinon.spy(server, 'decrementOperationCount');

      const operationPromises = Array.from({ length: 10 }, () =>
        collection.insertOne({ count: 1 })
      );

      await Promise.allSettled(operationPromises);

      expect(commandSpy.called).to.be.true;
      // This test is flaky when sleeping and asserting the operation count after the sleep but before the
      // promise execution, so we assert instead that the count was incremented 10 times and decremented 10
      // times - the total number of operations.
      expect(incrementSpy.callCount).to.equal(10);
      expect(decrementSpy.callCount).to.equal(10);
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

          sinon
            .stub(ConnectionPool.prototype, 'checkOut')
            .rejects(new Error('unable to checkout connection'));
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
