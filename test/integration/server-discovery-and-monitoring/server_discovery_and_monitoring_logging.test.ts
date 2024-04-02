import { expect } from 'chai';

import {
  Binary,
  EJSON,
  type MongoClient,
  type MongoDBLogWritable,
  type ServerHeartbeatSucceededEvent
} from '../../mongodb';

describe('SDAM Logging Integration Tests', function () {
  let client: MongoClient;
  const monitoringEvents: Array<ServerHeartbeatSucceededEvent> = [];
  const loggingEvents: Array<{ reply: string }> = [];

  beforeEach(function () {
    const logger: MongoDBLogWritable = {
      write(log) {
        if (log.message === 'Server heartbeat succeeded') {
          loggingEvents.push(log as unknown as { reply: string });
        }
      }
    };
    client = this.configuration.newClient(
      {},
      {
        mongodbLogPath: logger,
        mongodbLogComponentSeverities: { topology: 'trace' },
        [Symbol.for('@@mdb.enableMongoLogger')]: true
      }
    );

    client.on('serverHeartbeatSucceeded', monitoringEvents.push.bind(monitoringEvents));
  });

  it(
    'does not promote buffers',
    {
      requires: {
        topology: ['replicaset', 'sharded']
      }
    },
    async function () {
      await client.connect();
      await client.close();

      expect(monitoringEvents.length > 0).to.be.true;

      for (const heartbeat of monitoringEvents) {
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
    async function () {
      await client.connect();
      await client.close();

      expect(loggingEvents.length > 0).to.be.true;

      for (const hash of loggingEvents.map(
        message => EJSON.parse(message.reply).$clusterTime.signature.hash
      )) {
        expect(hash).to.exist;
        expect(hash).to.be.instanceof(Binary);
      }
    }
  );
});
