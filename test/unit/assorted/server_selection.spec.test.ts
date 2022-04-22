import { join } from 'path';

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
