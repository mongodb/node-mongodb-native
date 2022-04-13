import { EJSON } from "bson";
import { readdirSync, readFileSync, statSync } from "fs";
import { basename, extname, join } from "path";
import { Server } from "../../../src/sdam/server";
import { executeServerSelectionTest } from "./server_selection_spec_helper";
import { Document } from 'bson';

import * as sinon from 'sinon'

const selectionSpecDir = join(__dirname, '../../spec/server-selection/server_selection');
function collectSelectionTests(specDir) {
  const testTypes =
    readdirSync(specDir)
      .filter(d => statSync(join(specDir, d)).isDirectory());

  const tests = {};
  testTypes.forEach(testType => {
    tests[testType] =
      readdirSync(join(specDir, testType))
        .filter(d => statSync(join(specDir, testType, d)).isDirectory())
        .reduce((result, subType) => {
          result[subType] =
            readdirSync(join(specDir, testType, subType))
              .filter(f => extname(f) === '.json')
              .map(f => {
                const fileContents = readFileSync(join(
                  specDir, testType, subType, f
                ), { encoding: 'utf-8' });
                const subTypeData = EJSON.parse(
                  fileContents,
                  { relaxed: true }
                ) as unknown as Document;
                subTypeData.name = basename(f, '.json');
                subTypeData.type = testType;
                subTypeData.subType = subType
                return subTypeData
              });

          return result;
        }, {});
  });

  return tests;
}

describe('Server Selection (spec)', function () {
  let serverConnect;
  before(() => {
    serverConnect = sinon.stub(Server.prototype, 'connect').callsFake(function () {
      this.s.state = 'connected';
    });
  });

  beforeEach(function () {
    if (this.currentTest.title.match(/Possible/)) {
      (this.currentTest as any).skipReason = 'Nodejs driver does not support PossiblePrimary';
      this.skip();
    }
  });

  after(() => {
    serverConnect.restore();
  });

  const specTests = collectSelectionTests(selectionSpecDir);
  for (const topologyType of Object.keys(specTests)) {
    describe(topologyType, function () {
      for (const subType of Object.keys(specTests[topologyType])) {
        describe(subType, function () {
          for (const test of specTests[topologyType][subType]) {
            it(test.name, function (done) {
              executeServerSelectionTest(test, done);
            });
          }
        });
      }
    });
  }
});
