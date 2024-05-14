import { EventEmitter, once } from 'node:events';

import { expect } from 'chai';

import { type MongoClient, type ServerHeartbeatSucceededEvent } from '../../mongodb';
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
  let windows: Record<string, number[][]>;
  const thresh = 100; // Wait for 100 total heartbeats
  const SAMPLING_WINDOW_SIZE = 10;
  let count: number;
  const ee = new EventEmitter();
  const listener = (ev: ServerHeartbeatSucceededEvent) => {
    try {
      // @ts-expect-error accessing private fields
      const rttSampler = client.topology.s.servers.get(ev.connectionId).monitor.rttSampler;
      // @ts-expect-error accessing private fields
      const rttSamples = rttSampler.rttSamples;
      windows[ev.connectionId].push(Array.from(rttSamples));
      count++;
    } catch {
      // silently ignore when servers aren't yet populated
    }

    if (count === SAMPLING_WINDOW_SIZE) {
      ee.emit('samplingWindowFilled');
      return;
    }

    if (count >= thresh) {
      client.off('serverHeartbeatSucceeded', listener);
      ee.emit('done');
    }
  };

  beforeEach(function () {
    count = 0;
    windows = {};
  });

  afterEach(async function () {
    await client?.close();
  });

  for (const serverMonitoringMode of ['poll', 'stream']) {
    context(`when serverMonitoringMode is set to '${serverMonitoringMode}'`, function () {
      beforeEach(async function () {
        client = this.configuration.newClient({
          heartbeatFrequencyMS: 500,
          connectTimeoutMS: 1000,
          serverMonitoringMode
        });
        client.on('serverHeartbeatSucceeded', listener);

        await client.connect();

        for (const k of client.topology.s.servers.keys()) {
          windows[k] = [];
        }

        await once(ee, 'samplingWindowFilled');
      });

      it('rttSampler does not accumulate 0 rtt', {
        metadata: {
          requires: { topology: '!load-balanced' }
        },
        test: async function () {
          await once(ee, 'done');
          for (const s in windows) {
            // Test that at every point we collect a heartbeat, the rttSampler is not filled with
            // zeroes
            for (const window of windows[s]) {
              expect(window.reduce((acc, x) => x + acc)).to.be.greaterThanOrEqual(0);
            }
          }
        }
      });
    });
  }
});
