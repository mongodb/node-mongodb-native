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
  let durations: number[];
  const thresh = 40;
  const ee = new EventEmitter();
  const listener = (ev: ServerHeartbeatSucceededEvent) => {
    durations.push(ev.duration);
    if (durations.length >= thresh) {
      client.off('serverHeartbeatSucceeded', listener);
      ee.emit('done');
    }
  };

  beforeEach(function () {
    durations = [];
  });

  afterEach(async function () {
    await client?.close();
  });

  for (const serverMonitoringMode of ['poll', 'stream']) {
    context(`when serverMonitoringMode is set to '${serverMonitoringMode}'`, function () {
      beforeEach(async function () {
        client = this.configuration.newClient({
          heartbeatFrequencyMS: 100,
          serverMonitoringMode
        });
        client.on('serverHeartbeatSucceeded', listener);

        await client.connect();
      });

      it('duration of a successful heartbeat is never reported as 0ms', async function () {
        await once(ee, 'done');
        expect(durations.every(x => x !== 0)).to.be.true;
      });
    });
  }
});
