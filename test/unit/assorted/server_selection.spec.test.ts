import { join } from 'path';
import * as sinon from 'sinon';

import { Topology } from '../../../src/sdam/topology';
import {
  loadLatencyWindowTests,
  runServerSelectionLatencyWindowTest
} from './server_selection_latency_window_utils';
import {
  collectServerSelectionLogicTests,
  runServerSelectionLogicTest
} from './server_selection_logic_spec_utils';

describe('Server Selection Logic (spec)', function () {
  beforeEach(function () {
    if (this.currentTest.title.match(/Possible/)) {
      this.currentTest.skipReason = 'Nodejs driver does not support PossiblePrimary';
      this.skip();
    }
  });

  const selectionSpecDir = join(__dirname, '../../spec/server-selection/server_selection');
  const serverSelectionLogicTests = collectServerSelectionLogicTests(selectionSpecDir);
  for (const topologyType of Object.keys(serverSelectionLogicTests)) {
    describe(topologyType, function () {
      for (const subType of Object.keys(serverSelectionLogicTests[topologyType])) {
        describe(subType, function () {
          for (const test of serverSelectionLogicTests[topologyType][subType]) {
            it(test.name, function () {
              runServerSelectionLogicTest(test);
            });
          }
        });
      }
    });
  }
});

describe.only('Server Selection Latency Window Tests (spec)', function () {
  const selectionSpecDir = join(__dirname, '../../spec/server-selection/in_window');
  const tests = loadLatencyWindowTests(selectionSpecDir);

  for (const test of tests) {
    it(test.description, async function () {
      await runServerSelectionLatencyWindowTest(test);
    });
  }
});
