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
  });

  afterEach(async function () {
    collection.deleteMany({});
    await client.close();
    client = undefined;
  });

  context('operationCount', function () {
    context('operationCount is adjusted properly on successful operation', function () {
      it('is zero after a successful command', TEST_METADATA, async function () {
        let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        await collection.insertOne({
          name: 'Joe'
        });

        const lastCommand = commands[commands.length - 1];
        expect(lastCommand).to.exist;
        expect(lastCommand.commandName).to.equal('insert');
        serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);
      });

      it('is zero after a successful getMore', TEST_METADATA, async function () {
        await collection.insertMany([
          {
            name: 'joe'
          },
          { name: 'neal' }
        ]);
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next();

        let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        await cursor.next();

        const lastCommand = commands[commands.length - 1];
        expect(lastCommand).to.exist;
        expect(lastCommand.commandName).to.equal('getMore');
        serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        await cursor.close();
      });

      it('is zero after a successful killCursors', TEST_METADATA, async function () {
        await collection.insertMany([
          {
            name: 'joe'
          },
          { name: 'neal' }
        ]);
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next();

        let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        await cursor.close();

        const lastCommand = commands[commands.length - 1];
        expect(lastCommand).to.exist;
        expect(lastCommand.commandName).to.equal('killCursors');
        serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);
      });
    });

    context('operationCount is adjusted properly when operations fail', function () {
      afterEach(async function () {
        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: 'off',
          data: {
            failCommands: ['find', 'insert', 'getMore', 'killCursors'] // TODO : fill this out,
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

        let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        const error = await collection
          .insertOne({
            name: 'Joe'
          })
          .catch(e => e);

        expect(error).to.exist;

        const lastCommand = commands[commands.length - 1];
        expect(lastCommand).to.exist;
        expect(lastCommand.commandName).to.equal('insert');
        serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);
      });

      it('is zero after a getMore fails', TEST_METADATA, async function () {
        await collection.insertMany([
          {
            name: 'joe'
          },
          { name: 'neal' }
        ]);
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

        let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        const error = await cursor.next().catch(e => e);

        expect(error).to.exist;

        // We have to go back two commands, because when a getMore fails, the driver
        // closes the cursor
        const lastCommand = commands[commands.length - 2];
        expect(lastCommand).to.exist;
        expect(lastCommand.commandName).to.equal('getMore');
        serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        await cursor.close();
      });

      it('is zero after a killCursors fails', TEST_METADATA, async function () {
        await collection.insertMany([
          {
            name: 'joe'
          },
          { name: 'neal' }
        ]);
        const cursor = collection.find({}, { batchSize: 1 });
        await cursor.next();

        await client.db('admin').command({
          configureFailPoint: 'failCommand',
          mode: 'alwaysOn',
          data: {
            failCommands: ['killCursors'], // TODO : fill this out,
            errorCode: 80
          }
        });

        let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);

        // const error = await promisify(cursor.close.bind(cursor))().catch(err => err);
        // expect(error).to.exist;

        const lastCommand = commands[commands.length - 1];
        expect(lastCommand).to.exist;
        expect(lastCommand.commandName).to.equal('killCursors');
        serverDescription = Array.from(client.topology.s.description.servers.values())[0];
        expect(serverDescription.operationCount).to.equal(0);
      });
    });

    context(
      'operationCount is decremented when the server fails to checkout a connection',
      function () {
        afterEach(function () {
          sinon.restore();
        });

        it(
          'is zero after failing to check out a connection for a command',
          TEST_METADATA,
          async function () {
            let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
            expect(serverDescription.operationCount).to.equal(0);

            sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
              cb(new Error('unable to checkout connection'), undefined);
            });

            const error = await collection
              .insertOne({
                name: 'Joe'
              })
              .catch(e => e);

            expect(error).to.exist;
            expect(error).to.match(/unable/i);
            serverDescription = Array.from(client.topology.s.description.servers.values())[0];
            expect(serverDescription.operationCount).to.equal(0);
          }
        );

        it(
          'is zero after failing to check out a connection for a getMore',
          TEST_METADATA,
          async function () {
            await collection.insertMany([
              {
                name: 'joe'
              },
              { name: 'neal' }
            ]);
            const cursor = collection.find({}, { batchSize: 1 });
            await cursor.next();

            let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
            expect(serverDescription.operationCount).to.equal(0);

            sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
              cb(new Error('unable to checkout connection'), undefined);
            });

            const error = await cursor.next().catch(e => e);

            expect(error).to.exist;

            // We have to go back two commands, because when a getMore fails, the driver
            // closes the cursor
            serverDescription = Array.from(client.topology.s.description.servers.values())[0];
            expect(serverDescription.operationCount).to.equal(0);

            await cursor.close();
          }
        );

        it(
          'is zero after failing to check out a connection for a killCursors',
          TEST_METADATA,
          async function () {
            await collection.insertMany([
              {
                name: 'joe'
              },
              { name: 'neal' }
            ]);
            const cursor = collection.find({}, { batchSize: 1 });
            await cursor.next();

            let serverDescription = Array.from(client.topology.s.description.servers.values())[0];
            expect(serverDescription.operationCount).to.equal(0);

            sinon.stub(ConnectionPool.prototype, 'checkOut').callsFake(function (cb) {
              cb(new Error('unable to checkout connection'), undefined);
            });

            // const error = await promisify(cursor.close.bind(cursor))().catch(err => err);
            // expect(error).to.exist;

            serverDescription = Array.from(client.topology.s.description.servers.values())[0];
            expect(serverDescription.operationCount).to.equal(0);
          }
        );
      }
    );
  });
});
