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
  MongoCompatibilityError
} = require('../../../src/error');
const { ns } = require('../../../src/utils');
const { promisify } = require('util');
const { expect } = require('chai');

const specDir = path.resolve(__dirname, '../../spec/server-discovery-and-monitoring');
// const specDir =
//   '/Users/neal/code/drivers/mongodb-specifications/source/server-discovery-and-monitoring/tests';
function collectTests() {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.resolve(specDir, d)).isDirectory())
    .filter(d => d !== 'integration');

  const tests = {};
  for (const testType of testTypes) {
    tests[testType] = fs
      .readdirSync(path.join(specDir, testType))
      .filter(f => path.extname(f) === '.json')
      .map(f => {
        const result = EJSON.parse(fs.readFileSync(path.join(specDir, testType, f)), {
          relaxed: true
        });

        result.type = testType;
        result.fileName = path.join(testType, f);
        return result;
      });
  }

  return tests;
}

describe.only('Server Discovery and Monitoring (spec)', function () {
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

function convertOutcomeEvents(events) {
  return events.map(event => {
    const eventType = Object.keys(event)[0];
    const args = [];
    for (const key of Object.keys(event[eventType])) {
      let argument = event[eventType][key];
      if (argument.servers) {
        const serverEntries = argument.servers.map(server => [
          server.address,
          normalizeServerDescription(server)
        ]);
        argument.servers = Object.fromEntries(serverEntries);
      }

      if (typeof argument.topologyType === 'string') {
        // Translation for our driver's TopologyDescription class
        argument.type = argument.topologyType;
        delete argument.topologyType;
      }

      args.push(argument);
    }

    // convert snake case to camelCase with capital first letter
    let eventClass = eventType.replace(/_\w/g, c => c[1].toUpperCase());
    eventClass = eventClass.charAt(0).toUpperCase() + eventClass.slice(1);
    const eventConstructor = sdamEvents[eventClass];
    expect(eventConstructor).to.be.a('function');
    const eventInstance = new eventConstructor(...args);
    return eventInstance;
  });
}

// iterates through expectation building a path of keys that should not exist (null), and
// removes them from the expectation
function findOmittedFields(expected) {
  return Object.fromEntries(Object.entries(expected).filter(([, value]) => value == null));
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

  // connect the topology
  await promisify(topology.connect.bind(topology))(options);

  for (const phase of testData.phases) {
    const errorEvents = [];
    topology.on('error', error => errorEvents.push(error));

    if (phase.responses) {
      for (const [address, hello] of phase.responses) {
        topology.serverUpdateHandler(new ServerDescription(address, hello));
      }
      if (phase.outcome) {
        assertOutcomeExpectations(topology, events, phase.outcome);
        if (phase.outcome.compatible === false) {
          for (const errorEvent of errorEvents) {
            expect(errorEvent).to.be.instanceOf(MongoCompatibilityError);
            expect(errorEvent.message).to.match(/but this version of the driver/);
          }
        }
      }

      topology.removeAllListeners('error');
      events = [];
    } else if (phase.applicationErrors) {
      for (const appError of phase.applicationErrors) {
        let withConnectionStub = sinon
          .stub(ConnectionPool.prototype, 'withConnection')
          .callsFake(withConnectionStubImpl(appError));

        const server = topology.s.servers.get(appError.address);
        const res = promisify(server.command.bind(server))(ns('admin.$cmd'), { ping: 1 });
        withConnectionStub.restore();

        const thrownError = await res.catch(error => error);
        expect(thrownError).to.satisfy(
          error =>
            // These errors all come from the withConnection stub
            error instanceof MongoNetworkError ||
            error instanceof MongoNetworkTimeoutError ||
            error instanceof MongoServerError
        );
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

      command(ns, cmd, options, callback) {
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

  if (typeof outcome.topologyType === 'string') {
    // Translation for our driver's TopologyDescription class
    outcome.type = outcome.topologyType;
    delete outcome.topologyType;
  }

  for (const key of Object.keys(outcome)) {
    const outcomeValue = outcome[key];

    if (key === 'servers') {
      expect(description).to.include.keys(key);
      const expectedServers = outcomeValue;
      const actualServers = description[key];

      for (const serverName of Object.keys(expectedServers)) {
        expect(actualServers).to.include.keys(serverName);

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
      }

      continue;
    }

    // Load balancer mode has no monitor hello response and
    // only expects address and compatible to be set in the
    // server description.
    if (description.type === TopologyType.LoadBalanced) {
      if (key !== 'address' || key !== 'compatible') {
        continue;
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

      continue;
    }

    if (key === 'compatible' || key === 'setName') {
      if (outcomeValue == null) {
        expect(topology.description).to.have.property(key, undefined);
      } else {
        expect(topology.description).property(key).to.equal(outcomeValue);
      }

      continue;
    }

    expect(description).to.include.keys(key);

    if (outcomeValue == null) {
      expect(description).to.have.property(key, undefined);
    } else {
      if (typeof outcomeValue === 'object')
        expect(description).to.have.property(key).that.deep.equals(outcomeValue);
      else expect(description).to.have.property(key, outcomeValue);
    }
  }
}
