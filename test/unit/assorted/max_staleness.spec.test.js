'use strict';
const path = require('path');
const fs = require('fs');
const { executeServerSelectionTest } = require('./server_selection_spec_helper');
const { Server } = require('../../mongodb');
const { EJSON } = require('bson');
const sinon = require('sinon');

const maxStalenessDir = path.join(__dirname, '../../spec/max-staleness');
function collectStalenessTests(specDir) {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.join(specDir, d)).isDirectory());
  const tests = {};
  testTypes.forEach(testType => {
    tests[testType] = fs
      .readdirSync(path.join(specDir, testType))
      .filter(f => path.extname(f) === '.json')
      .map(f => {
        const result = EJSON.parse(fs.readFileSync(path.join(specDir, testType, f)), {
          relaxed: true
        });
        result.description = path.basename(f, '.json');
        result.type = testType;
        return result;
      });
  });
  return tests;
}
describe('Max Staleness (spec)', function () {
  let serverConnect;

  before(() => {
    serverConnect = sinon.stub(Server.prototype, 'connect').callsFake(function () {
      this.s.state = 'connected';
    });
  });

  after(() => {
    serverConnect.restore();
  });
  const specTests = collectStalenessTests(maxStalenessDir);
  Object.keys(specTests).forEach(specTestName => {
    describe(specTestName, () => {
      specTests[specTestName].forEach(testData => {
        it(testData.description, async function () {
          return executeServerSelectionTest(testData);
        });
      });
    });
  });
});
