import { expect } from 'chai';
import { setTimeout } from 'timers/promises';

import { Binary, type MongoDBLogWritable, type ServerHeartbeatSucceededEvent } from '../../mongodb';

describe('SDAM Logging Integration Tests', function () {
  const monitoringEvents: Array<ServerHeartbeatSucceededEvent> = [];
  const loggingEvents: Array<{ reply: string }> = [];

  beforeEach(async function () {
    const logger: MongoDBLogWritable = {
      write(log) {
        if (log.message === 'Server heartbeat succeeded') {
          loggingEvents.push(log as unknown as { reply: string });
        }
      }
    };
    const client = this.configuration.newClient(
      {},
      {
        mongodbLogPath: logger,
        mongodbLogComponentSeverities: { topology: 'trace' },
        [Symbol.for('@@mdb.enableMongoLogger')]: true
      }
    );

    client.on('serverHeartbeatSucceeded', monitoringEvents.push.bind(monitoringEvents));

    await client.connect();
    // give the driver a chance to connect to all servers and collect some heartbeats
    await setTimeout(100);
    await client.close();
  });

  it(
    'does not promote buffers',
    {
      requires: {
        topology: ['replicaset', 'sharded']
      }
    },
    function () {
      const heartbeats = monitoringEvents.filter(event => event.reply.$clusterTime);
      expect(heartbeats.length > 0, 'received no heartbeats with $clusterTimes').to.be.true;

      for (const heartbeat of heartbeats) {
        expect(heartbeat.reply.$clusterTime.signature?.hash).to.be.instanceOf(Binary);
      }
    }
  );

  it(
    'does not log messages `reply` field',
    {
      requires: {
        topology: ['replicaset', 'sharded']
      }
    },
    function () {
      const logs = loggingEvents.filter(log => log.reply.includes('$clusterTime'));

      expect(logs.length > 0).to.be.true;

      for (const message of logs) {
        expect(message.reply).to.include(`"hash":{"$binary"`);
      }
    }
  );
});
