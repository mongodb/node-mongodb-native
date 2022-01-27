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

  after(() => {
    serverConnect.restore();
  });

  const specTests = collectSelectionTests(selectionSpecDir);
  Object.keys(specTests).forEach(topologyType => {
    describe(topologyType, function () {
      Object.keys(specTests[topologyType]).forEach(subType => {
        describe(subType, function () {
          specTests[topologyType][subType].forEach(test => {
            // NOTE: node does not support PossiblePrimary
            const maybeIt = test.name.match(/Possible/) ? it.skip : it;

            maybeIt(test.name, function (done) {
              executeServerSelectionTest(test, done);
            });
          });
        });
      });
    });
  });
});
