import { EventEmitter, once } from 'node:events';
import { setTimeout } from 'node:timers/promises';

import { expect } from 'chai';
import * as sinon from 'sinon';

import { Connection, type MongoClient, type ServerHeartbeatSucceededEvent } from '../../mongodb';
import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('SDAM Unified Tests (Node Driver)', function () {
  // TODO(NODE-5723): Remove this once the actual unified tests (test/spec/server-disovery-and-monitoring/logging) are passing
  const clonedAndAlteredSpecTests = loadSpecTests(
    '../integration/server-discovery-and-monitoring/unified-sdam-node-specs'
  );
  runUnifiedSuite(clonedAndAlteredSpecTests);
});

describe('Monitoring rtt tests', function () {
  let client: MongoClient;
  let heartbeatDurations: Record<string, number[]>;
  const HEARTBEATS_TO_COLLECT = 200; // Wait for 200 total heartbeats. This is high enough to work for standalone, sharded and our typical 3-node replica set topology tests
  const IGNORE_SIZE = 20;
  const DELAY_MS = 10;
  let count: number;
  const ee = new EventEmitter();

  const listener = (ev: ServerHeartbeatSucceededEvent) => {
    if (!client.topology.s.servers.has(ev.connectionId)) return;
    count++;
    if (count < IGNORE_SIZE) {
      return;
    }

    heartbeatDurations[ev.connectionId].push(ev.duration);

    // We ignore the first few heartbeats since the problem reported in NODE-6172 showed that the
    // first few heartbeats were recorded properly
    if (count === IGNORE_SIZE) {
      return;
    }

    if (count >= HEARTBEATS_TO_COLLECT + IGNORE_SIZE) {
      client.off('serverHeartbeatSucceeded', listener);
      ee.emit('done');
    }
  };

  beforeEach(function () {
    count = 0;
    heartbeatDurations = {};
  });

  afterEach(async function () {
    if (client) {
      await client.close();
    }
    sinon.restore();
  });

  for (const serverMonitoringMode of ['poll', 'stream']) {
    context(`when serverMonitoringMode is set to '${serverMonitoringMode}'`, function () {
      context('after collecting a number of heartbeats', function () {
        beforeEach(async function () {
          client = this.configuration.newClient({
            heartbeatFrequencyMS: 100,
            serverMonitoringMode
          });

          // make send command delay for DELAY_MS ms to ensure that the actual time between sending
          // a heartbeat and receiving a response don't drop below 1ms. This is done since our
          // testing is colocated with its mongo deployment so network latency is very low
          const stub = sinon
            // @ts-expect-error accessing private method
            .stub(Connection.prototype, 'sendCommand')
            .callsFake(async function* (...args) {
              await setTimeout(DELAY_MS);
              yield* stub.wrappedMethod.call(this, ...args);
            });
          await client.connect();

          client.on('serverHeartbeatSucceeded', listener);

          for (const k of client.topology.s.servers.keys()) {
            heartbeatDurations[k] = [];
          }

          await once(ee, 'done');
        });

        it(
          'heartbeat duration is not incorrectly reported as zero on ServerHeartbeatSucceededEvents',
          {
            metadata: {
              requires: { topology: '!load-balanced' }
            },
            test: async function () {
              for (const server in heartbeatDurations) {
                const averageDuration =
                  heartbeatDurations[server].reduce((acc, x) => acc + x) /
                  heartbeatDurations[server].length;
                expect(averageDuration).to.be.gt(DELAY_MS);
              }
            }
          }
        );

        it('ServerDescription.roundTripTime is not incorrectly reported as zero', {
          metadata: {
            requires: { topology: '!load-balanced' }
          },
          test: async function () {
            await once(ee, 'done');
            for (const server in heartbeatDurations) {
              const averageDuration =
                heartbeatDurations[server].reduce((acc, x) => acc + x) /
                heartbeatDurations[server].length;
              expect(
                client.topology.description.servers.get(server).roundTripTime
              ).to.be.approximately(averageDuration, 1);
            }
          }
        });
      });
    });
  }
});
