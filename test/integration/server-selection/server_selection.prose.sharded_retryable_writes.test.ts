import { expect } from 'chai';

import type { CommandFailedEvent, CommandSucceededEvent } from '../../../src';

const TEST_METADATA = { requires: { mongodb: '>=4.3.1', topology: 'sharded' } };
const FAIL_COMMAND = {
  configureFailPoint: 'failCommand',
  mode: { times: 1 },
  data: {
    failCommands: ['insert'],
    errorCode: 6,
    errorLabels: ['RetryableWriteError'],
    closeConnection: true
  }
};
const DISABLE_FAIL_COMMAND = {
  configureFailPoint: 'failCommand',
  mode: 'off',
  data: {
    failCommands: ['find'],
    errorCode: 6,
    errorLabels: ['RetryableWriteError'],
    closeConnection: true
  }
};

describe('Server Selection Sharded Retryable Writes Prose tests', function () {
  context(
    'Test that in a sharded cluster writes are retried on a different mongos if one available',
    function () {
      const commandFailedEvents: CommandFailedEvent[] = [];
      let client;
      let utilClientOne;
      let utilClientTwo;
      // This test MUST be executed against a sharded cluster that has at least two mongos instances.
      // This test requires MongoDB 4.3.1+ for the errorLabels fail point option.
      // Ensure that a test is run against a sharded cluster that has at least two mongoses. If there are more than two mongoses in the cluster, pick two to test against.
      beforeEach(async function () {
        const uri = this.configuration.url({
          monitorCommands: true,
          useMultipleMongoses: true
        });

        // Create a client with retryWrites=true that connects to the cluster, providing the two selected mongoses as seeds.
        // Enable command monitoring, and execute a write command that is supposed to fail on both mongoses.
        client = this.configuration.newClient(uri, {
          monitorCommands: true,
          retryWrites: true
        });
        client.on('commandFailed', event => {
          commandFailedEvents.push(event);
        });
        await client.connect();
        const seeds = client.topology.s.seedlist.map(address => address.toString());

        // Create a client per mongos using the direct connection, and configure the following fail point on each mongos:
        // {
        //     configureFailPoint: "failCommand",
        //     mode: { times: 1 },
        //     data: {
        //         failCommands: ["insert"],
        //         errorCode: 6,
        //         errorLabels: ["RetryableWriteError"],
        //         closeConnection: true
        //     }
        // }
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

      // Asserts that there were failed command events from each mongos.
      // Disable the fail points.
      it('retries on a different mongos', TEST_METADATA, async function () {
        await client
          .db('test')
          .collection('test')
          .insertOne({ a: 1 })
          .catch(() => null);
        expect(commandFailedEvents[0].address).to.not.equal(commandFailedEvents[1].address);
      });
    }
  );

  context(
    'Test that in a sharded cluster writes are retried on the same mongos if no other is available',
    function () {
      // This test MUST be executed against a sharded cluster and requires MongoDB 4.3.1+ for the errorLabels fail point option.
      // Ensure that a test is run against a sharded cluster. If there are multiple mongoses in the cluster, pick one to test against.
      const commandFailedEvents: CommandFailedEvent[] = [];
      const commandSucceededEvents: CommandSucceededEvent[] = [];
      let client;
      let utilClient;

      beforeEach(async function () {
        const uri = this.configuration.url({
          monitorCommands: true
        });
        // Create a client that connects to the mongos using the direct connection, and configure the following fail point on the mongos:
        // {
        //     configureFailPoint: "failCommand",
        //     mode: { times: 1 },
        //     data: {
        //         failCommands: ["insert"],
        //         errorCode: 6,
        //         errorLabels: ["RetryableWriteError"],
        //         closeConnection: true
        //     }
        // }
        client = this.configuration.newClient(uri, {
          monitorCommands: true,
          retryWrites: true
        });
        client.on('commandFailed', event => {
          commandFailedEvents.push(event);
        });
        client.on('commandSucceeded', event => {
          commandSucceededEvents.push(event);
        });
        // Create a client with retryWrites=true that connects to the cluster, providing the selected mongos as the seed.
        // Enable command monitoring, and execute a write command that is supposed to fail.
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

      // Asserts that there was a failed command and a successful command event.
      // Disable the fail point.
      it('retries on the same mongos', TEST_METADATA, async function () {
        await client
          .db('test')
          .collection('test')
          .insertOne({ a: 1 })
          .catch(() => null);
        expect(commandFailedEvents[0].address).to.equal(commandSucceededEvents[0].address);
      });
    }
  );
});
