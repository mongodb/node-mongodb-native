import { expect } from 'chai';
import * as sinon from 'sinon';

import { Collection, CommandStartedEvent, MongoClient } from '../../../src';
import { ConnectionPool } from '../../../src/cmap/connection_pool';

const TEST_METADATA: MongoDBMetadataUI = {
  requires: {
    topology: 'single'
  }
};

describe('Server Selection', function () {
  let client: MongoClient;
  let commands: CommandStartedEvent[];
  let collection: Collection;

  beforeEach(async function () {
    client = this.configuration.newClient({
      monitorCommands: true
    });

    commands = [];

    client.on('commandStarted', e => {
      commands.push(e);
    });

    await client.connect();

    collection = client.db('server-selection-operation-count').collection('collection0');

    await collection.insertMany([{ name: 'joe' }, { name: 'smith' }]);
  });

  afterEach(async function () {
    sinon.restore();
    await collection.deleteMany({});
    await client.close();
    client = undefined;
  });

  context('operationCount', function () {
    context('operationCount is adjusted properly on successful operation', function () {
      it('is zero after a successful command', TEST_METADATA, async function () {
        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);
        const commandSpy = sinon.spy(server, 'command');

        await collection.insertOne({
          name: 'Joe'
        });

        expect(commandSpy.called).to.be.true;
        expect(server.s.operationCount).to.equal(0);
      });

      it('is zero after a successful getMore', TEST_METADATA, async function () {
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next(); // initialize the cursor

        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);

        const getMoreSpy = sinon.spy(server, 'getMore');

        await cursor.next();

        expect(getMoreSpy.called).to.be.true;
        expect(server.s.operationCount).to.equal(0);

        await cursor.close();
      });

      it('is zero after a successful killCursors', TEST_METADATA, async function () {
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next(); // initialize the cursor

        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);

        const killCursorsSpy = sinon.spy(server, 'killCursors');

        await cursor.close();

        expect(killCursorsSpy.called).to.be.true;
        expect(server.s.operationCount).to.equal(0);
      });
    });

    context('operationCount is adjusted properly when operations fail', function () {
      afterEach(async function () {
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: 'off',
          data: {
            failCommands: ['insert', 'getMore', 'killCursors'] // TODO : fill this out,
          }
        });
      });

      it('is zero after a command fails', TEST_METADATA, async function () {
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: 'alwaysOn',
          data: {
            failCommands: ['insert'], // TODO : fill this out,
            errorCode: 80
          }
        });

        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);

        const commandSpy = sinon.spy(server, 'command');

        const error = await collection
          .insertOne({
            name: 'Joe'
          })
          .catch(e => e);

        expect(error).to.exist;
        expect(commandSpy.called).to.be.true;

        expect(server.s.operationCount).to.equal(0);
      });

      it('is zero after a getMore fails', TEST_METADATA, async function () {
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next();

        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: 'alwaysOn',
          data: {
            failCommands: ['getMore'], // TODO : fill this out,
            errorCode: 80
          }
        });

        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);
        const getMoreSpy = sinon.spy(server, 'getMore');

        const error = await cursor.next().catch(e => e);

        expect(error).to.exist;
        expect(getMoreSpy.called).to.be.true;
        expect(server.s.operationCount).to.equal(0);

        await cursor.close();
      });

      it('is zero after a killCursors fails', TEST_METADATA, async function () {
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next(); // initialize the cursor

        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: 'alwaysOn',
          data: {
            failCommands: ['killCursors'], // TODO : fill this out,
            errorCode: 80
          }
        });

        const server = Array.from(client.topology.s.servers.values())[0];
        expect(server.s.operationCount).to.equal(0);
        const killCursorsSpy = sinon.spy(server, 'killCursors');

        await cursor.close().catch(err => err);
        // expect(error).to.exist;

        expect(killCursorsSpy.called).to.be.true;
        expect(server.s.operationCount).to.equal(0);
      });
    });

    context(
      'operationCount is decremented when the server fails to checkout a connection',
      function () {
        it(
          'is zero after failing to check out a connection for a command',
          TEST_METADATA,
          async function () {
            const server = Array.from(client.topology.s.servers.values())[0];
            expect(server.s.operationCount).to.equal(0);

            sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
              cb(new Error('unable to checkout connection'), undefined);
            });
            const commandSpy = sinon.spy(server, 'command');

            const error = await collection
              .insertOne({
                name: 'Joe'
              })
              .catch(e => e);

            expect(error).to.exist;
            expect(error).to.match(/unable to checkout connection/i);
            expect(commandSpy.called).to.be.true;
            expect(server.s.operationCount).to.equal(0);
          }
        );

        it(
          'is zero after failing to check out a connection for a getMore',
          TEST_METADATA,
          async function () {
            const cursor = collection.find({}, { batchSize: 1 });
            await cursor.next();

            const server = Array.from(client.topology.s.servers.values())[0];
            expect(server.s.operationCount).to.equal(0);

            sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
              cb(new Error('unable to checkout connection'), undefined);
            });
            const getMoreSpy = sinon.spy(server, 'getMore');

            const error = await cursor.next().catch(e => e);

            expect(error).to.exist;
            expect(error).to.match(/unable to checkout connection/i);
            expect(getMoreSpy.called).to.be.true;
            expect(server.s.operationCount).to.equal(0);

            sinon.restore();
            await cursor.close();
          }
        );

        it(
          'is zero after failing to check out a connection for a killCursors',
          TEST_METADATA,
          async function () {
            const cursor = collection.find({}, { batchSize: 1 });
            await cursor.next();

            const server = Array.from(client.topology.s.servers.values())[0];
            expect(server.s.operationCount).to.equal(0);

            sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
              cb(new Error('unable to checkout connection'), undefined);
            });
            const killCursorsSpy = sinon.spy(server, 'killCursors');

            await cursor.close().catch(err => err);
            // expect(error).to.exist;

            expect(killCursorsSpy.called).to.be.true;
            expect(server.s.operationCount).to.equal(0);
          }
        );
      }
    );
  });
});
