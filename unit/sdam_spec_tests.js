'use strict';
const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;
const Topology = require('../../../lib/sdam/topology').Topology;
const ServerDescription = require('../../../lib/sdam/server_description').ServerDescription;
const parse = require('../../../lib/uri_parser');

const specDir = path.join(__dirname, '..', 'spec', 'server-discovery-and-monitoring');
function collectTests() {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.join(specDir, d)).isDirectory());

  // const testTypes = ['rs'];
  const tests = {};
  testTypes.forEach(testType => {
    tests[testType] = fs
      .readdirSync(path.join(specDir, testType))
      .filter(f => path.extname(f) === '.json')
      .map(f => {
        const result = JSON.parse(fs.readFileSync(path.join(specDir, testType, f)));
        result.type = testType;
        return result;
      });
  });

  return tests;
}

describe('Server Discovery and Monitoring (spec)', function() {
  const specTests = collectTests();

  Object.keys(specTests).forEach(specTestName => {
    (specTestName === 'monitoring' ? describe.skip : describe)(specTestName, () => {
      specTests[specTestName].forEach(testData => {
        it(testData.description, {
          metadata: { requires: { topology: 'single' } },
          test: function(done) {
            executeSDAMTest(testData, done);
          }
        });
      });
    });
  });
});

const OUTCOME_TRANSLATIONS = {
  topologyType: 'type'
};

function translateOutcomeKey(key) {
  if (OUTCOME_TRANSLATIONS.hasOwnProperty(key)) {
    return OUTCOME_TRANSLATIONS[key];
  }

  return key;
}

function executeSDAMTest(testData, done) {
  parse(testData.uri, (err, parsedUri) => {
    if (err) return done(err);

    const topology = new Topology(parsedUri.hosts, parsedUri.options);
    topology.connect(testData.uri);

    testData.phases.forEach(phase => {
      // simulate each ismaster response
      phase.responses.forEach(response =>
        topology.update(new ServerDescription(response[0], response[1]))
      );

      // then verify the resulting outcome
      const description = topology.description;
      Object.keys(phase.outcome).forEach(key => {
        const outcomeValue = phase.outcome[key];
        const translatedKey = translateOutcomeKey(key);

        if (key === 'servers') {
          expect(description).to.include.keys(translatedKey);
          const expectedServers = outcomeValue;
          const actualServers = description[translatedKey];

          Object.keys(expectedServers).forEach(serverName => {
            expect(actualServers).to.include.keys(serverName);
            const expectedServer = expectedServers[serverName];
            const actualServer = actualServers[serverName];
            if (expectedServer.type === 'PossiblePrimary') {
              // Some single-threaded drivers care a lot about ordering potential primary
              // servers, in order to speed up selection. We don't care, so we'll just mark
              // it as `Unknown`.
              expectedServer.type = 'Unknown';
            }

            expect(actualServer).to.deep.include(expectedServer);
          });

          return;
        }

        expect(description).to.include.keys(translatedKey);
        expect(description[translatedKey]).to.eql(outcomeValue);
      });
    });

    done();
  });
}
