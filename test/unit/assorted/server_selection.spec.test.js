'use strict';
const path = require('path');
const fs = require('fs');
const { executeServerSelectionTest } = require('./server_selection_spec_helper');
const { Server } = require('../../../src/sdam/server');

const { EJSON } = require('bson');

const sinon = require('sinon');

const selectionSpecDir = path.join(__dirname, '../../spec/server-selection/server_selection');
function collectSelectionTests(specDir) {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.join(specDir, d)).isDirectory());

  const tests = {};
  testTypes.forEach(testType => {
    tests[testType] = fs
      .readdirSync(path.join(specDir, testType))
      .filter(d => fs.statSync(path.join(specDir, testType, d)).isDirectory())
      .reduce((result, subType) => {
        result[subType] = fs
          .readdirSync(path.join(specDir, testType, subType))
          .filter(f => path.extname(f) === '.json')
          .map(f => {
            const subTypeData = EJSON.parse(
              fs.readFileSync(path.join(specDir, testType, subType, f)),
              { relaxed: true }
            );
            subTypeData.name = path.basename(f, '.json');
            subTypeData.type = testType;
            subTypeData.subType = subType;
            return subTypeData;
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
      this.currentTest.skipReason = 'Nodejs driver does not support PossiblePrimary';
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
