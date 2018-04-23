'use strict';
const fs = require('fs');
const path = require('path');
const chai = require('chai');
const expect = chai.expect;
const Topology = require('../../../lib/sdam/topology').Topology;
const ServerDescription = require('../../../lib/sdam/server_description').ServerDescription;
const monitoring = require('../../../lib/sdam/monitoring');
const parse = require('../../../lib/uri_parser');
chai.use(require('chai-subset'));

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

const SKIPPED_TESTS = new Set([
  'Monitoring a replica set with non member' // reenable once `Server` is integrated into new `Topology`
]);

describe('Server Discovery and Monitoring (spec)', function() {
  const specTests = collectTests();

  Object.keys(specTests).forEach(specTestName => {
    describe(specTestName, () => {
      specTests[specTestName].forEach(testData => {
        it(testData.description, {
          metadata: { requires: { topology: 'single' } },
          test: function(done) {
            if (SKIPPED_TESTS.has(testData.description)) {
              return this.skip();
            }

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

function replacePlaceholders(actual, expected) {
  Object.keys(expected).forEach(key => {
    if (expected[key] === 42 || expected[key] === '42') {
      expect(actual).to.have.any.keys(key);
      expect(actual[key]).to.exist;
      actual[key] = expected[key];
    }
  });

  return actual;
}

function convertES6Maps(actual) {
  ['previousDescription', 'newDescription'].forEach(key => {
    if (actual[key] && actual[key].servers) {
      const servers = actual[key].servers;
      if (servers instanceof Map) {
        let obj = Object.create(null);
        for (const serverEntry of servers.entries()) {
          obj[serverEntry[0]] = serverEntry[1];
        }

        actual[key].servers = obj;
      }
    }
  });

  return actual;
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

function executeSDAMTest(testData, done) {
  parse(testData.uri, (err, parsedUri) => {
    if (err) return done(err);

    // create the topology
    const topology = new Topology(parsedUri.hosts, parsedUri.options);

    // listen for SDAM monitoring events
    const events = [];
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
            const expectedServer = normalizeServerDescription(expectedServers[serverName]);
            const actualServer = actualServers.get(serverName);
            expect(actualServer).to.deep.include(expectedServer);
          });

          return;
        }

        if (key === 'events') {
          const expectedEvents = convertOutcomeEvents(outcomeValue);
          expect(events).to.have.length(expectedEvents.length);
          for (let i = 0; i < events.length; ++i) {
            const expectedEvent = expectedEvents[i];
            const actualEvent = convertES6Maps(replacePlaceholders(events[i], expectedEvent));
            expect(actualEvent).to.containSubset(expectedEvent);
          }

          return;
        }

        expect(description).to.include.keys(translatedKey);
        expect(description[translatedKey]).to.eql(outcomeValue);
      });
    });

    done();
  });
}
