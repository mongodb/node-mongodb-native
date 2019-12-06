'use strict';
const fs = require('fs');
const path = require('path');
const Topology = require('../../../lib/core/sdam/topology').Topology;
const Server = require('../../../lib/core/sdam/server').Server;
const ServerDescription = require('../../../lib/core/sdam/server_description').ServerDescription;
const monitoring = require('../../../lib/core/sdam/monitoring');
const parse = require('../../../lib/core/uri_parser');
const sinon = require('sinon');

const chai = require('chai');
chai.use(require('chai-subset'));
chai.use(require('../../functional/spec-runner/matcher').default);
const expect = chai.expect;

const specDir = path.resolve(__dirname, '../../spec/server-discovery-and-monitoring');
function collectTests() {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.resolve(specDir, d)).isDirectory());

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
  let serverConnect;
  before(() => {
    serverConnect = sinon.stub(Server.prototype, 'connect');
  });

  after(() => {
    serverConnect.restore();
  });

  const specTests = collectTests();
  Object.keys(specTests).forEach(specTestName => {
    describe(specTestName, () => {
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

const OUTCOME_TRANSLATIONS = new Map();
OUTCOME_TRANSLATIONS.set('topologyType', 'type');

function translateOutcomeKey(key) {
  if (OUTCOME_TRANSLATIONS.has(key)) {
    return OUTCOME_TRANSLATIONS.get(key);
  }

  return key;
}

function convertOutcomeEvents(events) {
  return events.map(event => {
    const eventType = Object.keys(event)[0];
    const args = [];
    Object.keys(event[eventType]).forEach(key => {
      let argument = event[eventType][key];
      if (argument.servers) {
        argument.servers = argument.servers.reduce((result, server) => {
          result[server.address] = normalizeServerDescription(server);
          return result;
        }, {});
      }

      Object.keys(argument).forEach(key => {
        if (OUTCOME_TRANSLATIONS.has(key)) {
          argument[OUTCOME_TRANSLATIONS.get(key)] = argument[key];
          delete argument[key];
        }
      });

      args.push(argument);
    });

    // convert snake case to camelCase with capital first letter
    let eventClass = eventType.replace(/_\w/g, c => c[1].toUpperCase());
    eventClass = eventClass.charAt(0).toUpperCase() + eventClass.slice(1);
    args.unshift(null);
    const eventConstructor = monitoring[eventClass];
    const eventInstance = new (Function.prototype.bind.apply(eventConstructor, args))();
    return eventInstance;
  });
}

// iterates through expectation building a path of keys that should not exist (null), and
// removes them from the expectation (NOTE: this mutates the expectation)
function findOmittedFields(expected) {
  const result = [];
  Object.keys(expected).forEach(key => {
    if (expected[key] == null) {
      result.push(key);
      delete expected[key];
    }
  });

  return result;
}

function normalizeServerDescription(serverDescription) {
  if (serverDescription.type === 'PossiblePrimary') {
    // Some single-threaded drivers care a lot about ordering potential primary
    // servers, in order to speed up selection. We don't care, so we'll just mark
    // it as `Unknown`.
    serverDescription.type = 'Unknown';
  }

  return serverDescription;
}

function cloneMap(map) {
  const result = Object.create(null);
  for (let key of map.keys()) {
    result[key] = JSON.parse(JSON.stringify(map.get(key)));
  }

  return result;
}

function cloneForCompare(event) {
  const result = JSON.parse(JSON.stringify(event));
  ['previousDescription', 'newDescription'].forEach(key => {
    if (event[key] != null && event[key].servers != null) {
      result[key].servers = cloneMap(event[key].servers);
    }
  });

  return result;
}

function executeSDAMTest(testData, testDone) {
  parse(testData.uri, (err, parsedUri) => {
    if (err) return done(err);

    // create the topology
    const topology = new Topology(parsedUri.hosts, parsedUri.options);

    // listen for SDAM monitoring events
    let events = [];
    [
      'serverOpening',
      'serverClosed',
      'serverDescriptionChanged',
      'topologyOpening',
      'topologyClosed',
      'topologyDescriptionChanged',
      'serverHeartbeatStarted',
      'serverHeartbeatSucceeded',
      'serverHeartbeatFailed'
    ].forEach(eventName => {
      topology.on(eventName, event => events.push(event));
    });

    // connect the topology
    topology.connect(testData.uri);

    function done(err) {
      topology.close(e => testDone(e || err));
    }

    const incompatabilityHandler = err => {
      if (err.message.match(/but this version of the driver/)) return;
      throw err;
    };

    testData.phases.forEach(phase => {
      const incompatibilityExpected = phase.outcome ? !phase.outcome.comptabile : false;
      if (incompatibilityExpected) {
        topology.on('error', incompatabilityHandler);
      }

      // simulate each ismaster response
      phase.responses.forEach(response =>
        topology.serverUpdateHandler(new ServerDescription(response[0], response[1]))
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
            const expectedServer = normalizeServerDescription(expectedServers[serverName]);
            const omittedFields = findOmittedFields(expectedServer);

            const actualServer = actualServers.get(serverName);
            expect(actualServer).to.deep.include(expectedServer);

            if (omittedFields.length) {
              expect(actualServer).to.not.have.all.keys(omittedFields);
            }
          });

          return;
        }

        if (key === 'events') {
          const expectedEvents = convertOutcomeEvents(outcomeValue);
          expect(events).to.have.length(expectedEvents.length);
          for (let i = 0; i < events.length; ++i) {
            const expectedEvent = expectedEvents[i];
            const actualEvent = cloneForCompare(events[i]);
            expect(actualEvent).to.matchMongoSpec(expectedEvent);
          }

          return;
        }

        if (key === 'compatible' || key === 'setName') {
          expect(topology.description[key]).to.equal(outcomeValue);
          return;
        }

        expect(description).to.include.keys(translatedKey);
        expect(description[translatedKey]).to.eql(outcomeValue);
      });

      // remove error handler
      topology.removeListener('error', incompatabilityHandler);

      // reset the captured events for each phase
      events = [];
    });

    topology.close(done);
  });
}
