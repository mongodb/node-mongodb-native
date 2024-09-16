import { setTimeout } from 'node:timers/promises';

import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  Connection,
  type MongoClient,
  promiseWithResolvers,
  type ServerHeartbeatSucceededEvent
} from '../../mongodb';
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
  const HEARTBEATS_TO_COLLECT_PER_NODE = 65;
  const IGNORE_SIZE = 5;
  const DELAY_MS = 10;

  beforeEach(function () {
    heartbeatDurations = Object.create(null);
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

          // make sendCommand delay for DELAY_MS ms to ensure that the actual time between sending
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

          const { promise, resolve } = promiseWithResolvers<void>();
          client.on('serverHeartbeatSucceeded', (ev: ServerHeartbeatSucceededEvent) => {
            heartbeatDurations[ev.connectionId] ??= [];
            if (
              heartbeatDurations[ev.connectionId].length <
              HEARTBEATS_TO_COLLECT_PER_NODE + IGNORE_SIZE
            )
              heartbeatDurations[ev.connectionId].push(ev.duration);

            // We ignore the first few heartbeats since the problem reported in NODE-6172 showed that the
            // first few heartbeats were recorded properly
            if (
              Object.keys(heartbeatDurations).length === client.topology.s.servers.size &&
              Object.values(heartbeatDurations).every(
                d => d.length === HEARTBEATS_TO_COLLECT_PER_NODE + IGNORE_SIZE
              )
            ) {
              client.removeAllListeners('serverHeartbeatSucceeded');
              resolve();
            }
          });
          await promise;
        });

        it(
          'heartbeat duration is not incorrectly reported as zero on ServerHeartbeatSucceededEvents',
          {
            metadata: {
              requires: { topology: '!load-balanced' }
            },
            test: async function () {
              for (const durations of Object.values(heartbeatDurations)) {
                const relevantDurations = durations.slice(IGNORE_SIZE);
                expect(relevantDurations).to.have.length.gt(0);
                const averageDuration =
                  relevantDurations.reduce((acc, x) => acc + x) / relevantDurations.length;
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
            for (const [server, durations] of Object.entries(heartbeatDurations)) {
              const relevantDurations = durations.slice(IGNORE_SIZE);
              expect(relevantDurations).to.have.length.gt(0);
              const averageDuration =
                relevantDurations.reduce((acc, x) => acc + x) / relevantDurations.length;
              const rtt = client.topology.description.servers.get(server).roundTripTime;
              expect(rtt).to.not.equal(0);
              expect(rtt).to.be.approximately(averageDuration, 3);
            }
          }
        });
      });
    });
  }
});
