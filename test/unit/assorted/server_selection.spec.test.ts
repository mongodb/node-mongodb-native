import { Document, EJSON } from 'bson';
import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, extname, join } from 'path';

import { runServerSelectionLogicTest } from './server_selection_logic_spec_utils';

function collectServerSelectionLogicTests(specDir) {
  const testTypes = readdirSync(specDir).filter(d => statSync(join(specDir, d)).isDirectory());

  const tests = {};
  for (const testType of testTypes) {
    const testsOfType = readdirSync(join(specDir, testType)).filter(d =>
      statSync(join(specDir, testType, d)).isDirectory()
    );
    const result = {};
    for (const subType of testsOfType) {
      result[subType] = readdirSync(join(specDir, testType, subType))
        .filter(f => extname(f) === '.json')
        .map(f => {
          const fileContents = readFileSync(join(specDir, testType, subType, f), {
            encoding: 'utf-8'
          });
          const test = EJSON.parse(fileContents, { relaxed: true }) as unknown as Document;
          test.name = basename(f, '.json');
          test.type = testType;
          test.subType = subType;
          return test;
        });
    }

    tests[testType] = result;
  }

  return tests;
}

describe('Server Selection Logic (spec)', function () {
  beforeEach(function () {
    if (this.currentTest.title.match(/Possible/)) {
      (this.currentTest as any).skipReason = 'Nodejs driver does not support PossiblePrimary';
      this.skip();
    }

    if (this.currentTest.title.match(/nearest_multiple/i)) {
      (this.currentTest as any).skipReason =
        'TODO(NODE-4188): localThresholdMS should default to 15ms';
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
