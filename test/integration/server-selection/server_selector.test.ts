import { expect } from 'chai';
import { setTimeout } from 'timers/promises';

import {
  type CommandStartedEvent,
  HostAddress,
  type MongoClient,
  ReadPreference,
  ServerType
} from '../../mongodb';

const METADATA: MongoDBMetadataUI = { requires: { topology: 'replicaset' } };

describe('serverSelector option', function () {
  let client: MongoClient | undefined;

  afterEach(async function () {
    await client?.close();
    client = undefined;
  });

  it('sends nearest reads to the member the selector returns', METADATA, async function () {
    client = this.configuration.newClient(
      {},
      {
        monitorCommands: true,
        serverSelector(servers) {
          return [highestPort(servers)];
        }
      }
    );
    const activeClient = client;
    await activeClient.connect();
    await waitForMembers(activeClient);

    const finds: CommandStartedEvent[] = [];
    activeClient.on('commandStarted', event => {
      if (event.commandName === 'find') finds.push(event);
    });

    const collection = activeClient.db('serverSelectorTest').collection(`members_${Date.now()}`);
    await collection.insertMany([{ name: 'Ada' }, { name: 'Grace' }]);
    for (let attempt = 0; attempt < 5; attempt++) {
      await collection.findOne({ name: 'Ada' }, { readPreference: ReadPreference.nearest });
    }

    const topology = activeClient.topology;
    if (topology == null) {
      throw new Error('client is not connected');
    }
    const expected = highestPort(
      Array.from(topology.description.servers.values()).filter(
        server => server.type === ServerType.RSPrimary || server.type === ServerType.RSSecondary
      )
    );
    expect(finds).to.not.be.empty;
    for (const event of finds) {
      expect(event.address).to.equal(expected.address);
    }
    await collection.drop().catch(() => null);
  });
});

function highestPort<T extends { address: string }>(servers: T[]): T {
  let selected = servers[0];
  for (const server of servers) {
    if (portOf(server.address) > portOf(selected.address)) selected = server;
  }
  return selected;
}

function portOf(address: string): number {
  return HostAddress.fromString(address).port ?? 0;
}

async function waitForMembers(client: MongoClient): Promise<void> {
  const hello = await client.db('admin').command({ hello: 1 });
  const hosts = new Set<string>(
    ((hello.hosts as string[] | undefined) ?? []).map(host => host.toLowerCase())
  );
  if (hosts.size === 0) {
    throw new Error('hello did not report replica set hosts');
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const known = new Set(
      Array.from(client.topology?.description.servers.values() ?? [])
        .filter(server => server.type !== ServerType.Unknown)
        .map(server => server.address.toLowerCase())
    );
    const discovered = Array.from(hosts).every(host => known.has(host));
    if (discovered) return;
    await setTimeout(100);
  }
  throw new Error('timed out waiting for replica set members');
}
