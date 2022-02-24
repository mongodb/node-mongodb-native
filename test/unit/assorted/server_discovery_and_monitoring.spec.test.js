'use strict';
const fs = require('fs');
const path = require('path');
const { Topology } = require('../../../src/sdam/topology');
const { TopologyType } = require('../../../src/sdam/common');
const { Server } = require('../../../src/sdam/server');
const { ServerDescription } = require('../../../src/sdam/server_description');
const sdamEvents = require('../../../src/sdam/events');
const { parseOptions } = require('../../../src/connection_string');
const sinon = require('sinon');
const { EJSON } = require('bson');
const { ConnectionPool } = require('../../../src/cmap/connection_pool');
const {
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoServerError,
  MongoError
} = require('../../../src/error');
const { ns } = require('../../../src/utils');
const { promisify } = require('util');
const { expect } = require('chai');

const specDir = path.resolve(__dirname, '../../spec/server-discovery-and-monitoring');
function collectTests() {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.resolve(specDir, d)).isDirectory())
    .filter(d => d !== 'integration');

  const tests = {};
  testTypes.forEach(testType => {
    tests[testType] = fs
      .readdirSync(path.join(specDir, testType))
      .filter(f => path.extname(f) === '.json')
      .map(f => {
        const result = EJSON.parse(fs.readFileSync(path.join(specDir, testType, f)), {
          relaxed: true
        });

        result.type = testType;
        return result;
      });
  });

  return tests;
}

describe('Server Discovery and Monitoring (spec)', function () {
  let serverConnect;
  before(() => {
    serverConnect = sinon.stub(Server.prototype, 'connect').callsFake(function () {
      this.s.state = 'connected';
      this.emit('connect');
    });
  });

  after(() => {
    serverConnect.restore();
  });

  const specTests = collectTests();
  for (const specTestName of Object.keys(specTests)) {
    describe(specTestName, () => {
      for (const testData of specTests[specTestName]) {
        it(testData.description, async function () {
          await executeSDAMTest(testData);
        });
      }
    });
  }
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
    const eventConstructor = sdamEvents[eventClass];
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

const SDAM_EVENTS = [
  'serverOpening',
  'serverClosed',
  'serverDescriptionChanged',
  'topologyOpening',
  'topologyClosed',
  'topologyDescriptionChanged',
  'serverHeartbeatStarted',
  'serverHeartbeatSucceeded',
  'serverHeartbeatFailed'
];

async function executeSDAMTest(testData) {
  const options = parseOptions(testData.uri);
  // create the topology
  const topology = new Topology(options.hosts, options);
  // Each test will attempt to connect by doing server selection. We want to make the first
  // call to `selectServers` call a fake, and then immediately restore the original behavior.
  let topologySelectServers = sinon
    .stub(Topology.prototype, 'selectServer')
    .callsFake(function (selector, options, callback) {
      topologySelectServers.restore();

      const fakeServer = { s: { state: 'connected' }, removeListener: () => {} };
      callback(undefined, fakeServer);
    });
  // listen for SDAM monitoring events
  let events = [];

  for (const eventName of SDAM_EVENTS) {
    topology.on(eventName, event => events.push(event));
  }

  const incompatibilityHandler = err => {
    if (err.message.match(/but this version of the driver/)) return;
    throw err;
  };

  // connect the topology
  await promisify(topology.connect.bind(topology))(options);

  for (const phase of testData.phases) {
    const incompatibilityExpected = phase.outcome ? !phase.outcome.compatible : false;

    if (incompatibilityExpected) {
      topology.on('error', incompatibilityHandler);
    }

    if (phase.responses) {
      for (const [address, hello] of phase.responses) {
        topology.serverUpdateHandler(new ServerDescription(address, hello));
      }
      if (phase.outcome) {
        assertOutcomeExpectations(topology, events, phase.outcome);
      }
      topology.removeListener('error', incompatibilityHandler);
      events = [];
    } else if (phase.applicationErrors) {
      for (const appError of phase.applicationErrors) {
        let withConnectionStub = sinon
          .stub(ConnectionPool.prototype, 'withConnection')
          .callsFake(withConnectionStubImpl(appError));

        const server = topology.s.servers.get(appError.address);
        const res = promisify(server.command.bind(server))(ns('admin.$cmd'), { ping: 1 });
        withConnectionStub.restore();

        let thrownError;
        try {
          await res;
        } catch (error) {
          thrownError = error;
        }
        expect(thrownError).to.be.instanceOf(MongoError); // TODO: Can we narrow this check more?
      }
    }
  }
}

function withConnectionStubImpl(appError) {
  return function (conn, fn, callback) {
    const connectionPool = this; // we are stubbing `withConnection` on the `ConnectionPool` class
    const fakeConnection = {
      generation:
        typeof appError.generation === 'number' ? appError.generation : connectionPool.generation,

      command: (ns, cmd, options, callback) => {
        if (appError.type === 'network') {
          callback(new MongoNetworkError('test generated'));
        } else if (appError.type === 'timeout') {
          callback(
            new MongoNetworkTimeoutError('xxx timed out', {
              beforeHandshake: appError.when === 'beforeHandshakeCompletes'
            })
          );
        } else {
          callback(new MongoServerError(appError.response));
        }
      }
    };

    fn(undefined, fakeConnection, (fnErr, result) => {
      if (typeof callback === 'function') {
        if (fnErr) {
          callback(fnErr);
        } else {
          callback(undefined, result);
        }
      }
    });
  };
}

function assertOutcomeExpectations(topology, events, outcome) {
  // then verify the resulting outcome
  const description = topology.description;
  Object.keys(outcome).forEach(key => {
    const outcomeValue = outcome[key];
    const translatedKey = translateOutcomeKey(key);

    if (key === 'servers') {
      expect(description).to.include.keys(translatedKey);
      const expectedServers = outcomeValue;
      const actualServers = description[translatedKey];

      Object.keys(expectedServers).forEach(serverName => {
        expect(actualServers).to.include.keys(serverName);

        // TODO: clean all this up, always operate directly on `Server` not `ServerDescription`
        if (expectedServers[serverName].pool) {
          const expectedPool = expectedServers[serverName].pool;
          delete expectedServers[serverName].pool;
          const actualPoolGeneration = topology.s.servers.get(serverName).s.pool.generation;
          expect(actualPoolGeneration).to.equal(expectedPool.generation);
        }

        const expectedServer = normalizeServerDescription(expectedServers[serverName]);
        const omittedFields = findOmittedFields(expectedServer);

        const actualServer = actualServers.get(serverName);
        expect(actualServer).to.matchMongoSpec(expectedServer);

        if (omittedFields.length) {
          expect(actualServer).to.not.have.all.keys(omittedFields);
        }
      });

      return;
    }

    // Load balancer mode has no monitor hello response and
    // only expects address and compatible to be set in the
    // server description.
    if (description.type === TopologyType.LoadBalanced) {
      if (key !== 'address' || key !== 'compatible') {
        return;
      }
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
      if (outcomeValue == null) {
        expect(topology.description[key]).to.not.exist;
      } else {
        expect(topology.description).property(key).to.equal(outcomeValue);
      }

      return;
    }

    expect(description).to.include.keys(translatedKey);

    if (outcomeValue == null) {
      expect(description[translatedKey]).to.not.exist;
    } else {
      expect(description).to.have.property(translatedKey).that.deep.equals(outcomeValue);
    }
  });
}
