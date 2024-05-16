import { expect } from 'chai';

import type { CommandFailedEvent, CommandSucceededEvent } from '../../mongodb';

const TEST_METADATA = { requires: { mongodb: '>=4.2.9', topology: 'sharded' } };
const FAIL_COMMAND = {
  configureFailPoint: 'failCommand',
  mode: { times: 1 },
  data: {
    failCommands: ['find'],
    errorCode: 6,
    closeConnection: true
  }
};
const DISABLE_FAIL_COMMAND = {
  configureFailPoint: 'failCommand',
  mode: 'off',
  data: {
    failCommands: ['find'],
    errorCode: 6,
    closeConnection: true
  }
};
describe('Server Selection Sharded Retryable Reads Prose tests', function () {
  describe('Retryable Reads Are Retried on a Different mongos if One is Available', function () {
    const commandFailedEvents: CommandFailedEvent[] = [];
    let client;
    let utilClientOne;
    let utilClientTwo;
    // This test MUST be executed against a sharded cluster that has at least two
    // mongos instances.
    // 1. Ensure that a test is run against a sharded cluster that has at least two
    //    mongoses. If there are more than two mongoses in the cluster, pick two to
    //    test against.
    beforeEach(async function () {
      const uri = this.configuration.url({
        monitorCommands: true,
        useMultipleMongoses: true
      });
      // 3. Create a client with ``retryReads=true`` that connects to the cluster,
      //    providing the two selected mongoses as seeds.
      client = this.configuration.newClient(uri, {
        monitorCommands: true,
        retryReads: true
      });
      client.on('commandFailed', event => {
        commandFailedEvents.push(event);
      });
      await client.connect();
      const seeds = client.topology.s.seedlist.map(address => address.toString());
      // 2. Create a client per mongos using the direct connection, and configure the
      //    following fail points on each mongos::
      //      {
      //          configureFailPoint: "failCommand",
      //          mode: { times: 1 },
      //          data: {
      //              failCommands: ["find"],
      //              errorCode: 6,
      //              closeConnection: true
      //          }
      //      }
      utilClientOne = this.configuration.newClient(`mongodb://${seeds[0]}`, {
        directConnection: true
      });
      utilClientTwo = this.configuration.newClient(`mongodb://${seeds[1]}`, {
        directConnection: true
      });
      await utilClientOne.db('admin').command(FAIL_COMMAND);
      await utilClientTwo.db('admin').command(FAIL_COMMAND);
    });

    afterEach(async function () {
      await client?.close();
      await utilClientOne.db('admin').command(DISABLE_FAIL_COMMAND);
      await utilClientTwo.db('admin').command(DISABLE_FAIL_COMMAND);
      await utilClientOne?.close();
      await utilClientTwo?.close();
    });
    // 4. Enable command monitoring, and execute a ``find`` command that is
    //    supposed to fail on both mongoses.
    // 5. Asserts that there were failed command events from each mongos.
    // 6. Disable the fail points.
    it('retries on a different mongos', TEST_METADATA, async function () {
      await client
        .db('test')
        .collection('test')
        .find()
        .toArray()
        .catch(() => null);
      expect(commandFailedEvents[0].address).to.not.equal(commandFailedEvents[1].address);
    });
  });
  // 1. Ensure that a test is run against a sharded cluster. If there are multiple
  // mongoses in the cluster, pick one to test against.
  describe('Retryable Reads Are Retried on the Same mongos if No Others are Available', function () {
    const commandFailedEvents: CommandFailedEvent[] = [];
    const commandSucceededEvents: CommandSucceededEvent[] = [];
    let client;
    let utilClient;

    beforeEach(async function () {
      const uri = this.configuration.url({
        monitorCommands: true
      });
      // 3. Create a client with ``retryReads=true`` that connects to the cluster,
      //     providing the selected mongos as the seed.
      client = this.configuration.newClient(uri, {
        monitorCommands: true,
        retryReads: true
      });
      client.on('commandFailed', event => {
        commandFailedEvents.push(event);
      });
      client.on('commandSucceeded', event => {
        commandSucceededEvents.push(event);
      });
      // 2. Create a client that connects to the mongos using the direct connection,
      //     and configure the following fail point on the mongos::
      //       {
      //           configureFailPoint: "failCommand",
      //           mode: { times: 1 },
      //           data: {
      //               failCommands: ["find"],
      //               errorCode: 6,
      //               closeConnection: true
      //           }
      //       }
      utilClient = this.configuration.newClient(uri, {
        directConnection: true
      });
      await utilClient.db('admin').command(FAIL_COMMAND);
    });

    afterEach(async function () {
      await client?.close();
      await utilClient?.db('admin').command(DISABLE_FAIL_COMMAND);
      await utilClient?.close();
    });
    // 4. Enable command monitoring, and execute a ``find`` command.
    // 5. Asserts that there was a failed command and a successful command event.
    // 6. Disable the fail point.
    it('retries on the same mongos', TEST_METADATA, async function () {
      await client
        .db('test')
        .collection('test')
        .find()
        .toArray()
        .catch(() => null);
      expect(commandFailedEvents[0].address).to.equal(commandSucceededEvents[0].address);
    });
  });
});
