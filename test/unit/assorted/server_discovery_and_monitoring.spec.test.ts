import { EJSON } from 'bson';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { promisify } from 'util';

import { ConnectionPool } from '../../../src/cmap/connection_pool';
import { parseOptions } from '../../../src/connection_string';
import {
  MongoCompatibilityError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoServerError
} from '../../../src/error';
import { TopologyType } from '../../../src/sdam/common';
import {
  ServerClosedEvent,
  ServerDescriptionChangedEvent,
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerOpeningEvent,
  TopologyClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent
} from '../../../src/sdam/events';
import { Server } from '../../../src/sdam/server';
import { ServerDescription } from '../../../src/sdam/server_description';
import { Topology } from '../../../src/sdam/topology';
import { isRecord, ns } from '../../../src/utils';

const SDAM_EVENT_CLASSES = {
  ServerDescriptionChangedEvent,
  ServerOpeningEvent,
  ServerClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent,
  TopologyClosedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerHeartbeatFailedEvent
};

const specDir = path.resolve(__dirname, '../../spec/server-discovery-and-monitoring');
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
        const filePath = path.join(specDir, testType, f);
        const result = EJSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }), {
          relaxed: true
        });

        if (!isRecord(result) || Array.isArray(result)) {
          throw new Error(`${filePath} did not contain a top-level object`);
        }

        result.type = testType;
        result.fileName = path.join(testType, f); // unused but helpful when debugging
        return result;
      });
  }

  return tests;
}

describe('Server Discovery and Monitoring (spec)', function () {
  let serverConnect: sinon.SinonStub;
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
        it(testData.description, async () => {
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
      const argument = event[eventType][key];
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
    const eventConstructor = SDAM_EVENT_CLASSES[eventClass];
    expect(eventConstructor).to.be.a('function');
    const eventInstance = new eventConstructor(...args);
    return eventInstance;
  });
}

// iterates through expectation building a path of keys that should not exist (null), and
// removes them from the expectation (NOTE: this mutates the expectation)
function findOmittedFields(expected) {
  const result = [];
  for (const key of Object.keys(expected)) {
    if (expected[key] == null) {
      result.push(key);
      delete expected[key];
    }
  }

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
  for (const key of map.keys()) {
    result[key] = JSON.parse(JSON.stringify(map.get(key)));
  }

  return result;
}

function cloneForCompare(event) {
  const result = JSON.parse(JSON.stringify(event));

  if (event.previousDescription != null && event.previousDescription.servers != null) {
    result.previousDescription.servers = cloneMap(event.previousDescription.servers);
  }

  if (event.newDescription != null && event.newDescription.servers != null) {
    result.newDescription.servers = cloneMap(event.newDescription.servers);
  }

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
  const topologySelectServers = sinon
    .stub(Topology.prototype, 'selectServer')
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .callsFake(function (selector, options, callback) {
      topologySelectServers.restore();

      const fakeServer = { s: { state: 'connected' }, removeListener: () => true };
      // @ts-expect-error: stub doesn't need to be a full server
      callback(undefined, fakeServer);
    });
  // listen for SDAM monitoring events
  let events = [];

  for (const eventName of SDAM_EVENTS) {
    topology.on(eventName, event => events.push(event));
  }

  const errorEvents = [];
  topology.on('error', error => errorEvents.push(error));

  // connect the topology
  await promisify(topology.connect.bind(topology))(options);

  for (const phase of testData.phases) {
    if (phase.responses) {
      for (const [address, hello] of phase.responses) {
        topology.serverUpdateHandler(new ServerDescription(address, hello));
      }
      if (phase.outcome) {
        assertOutcomeExpectations(topology, events, phase.outcome);
        if (phase.outcome.compatible === false) {
          expect(errorEvents).to.have.length.greaterThanOrEqual(1);
          for (const errorEvent of errorEvents) {
            expect(errorEvent).to.be.instanceOf(MongoCompatibilityError);
            expect(errorEvent.message).to.match(/but this version of the driver/);
          }
        }
      }

      events = [];
    } else if (phase.applicationErrors) {
      for (const appError of phase.applicationErrors) {
        const withConnectionStub = sinon
          .stub(ConnectionPool.prototype, 'withConnection')
          .callsFake(withConnectionStubImpl(appError));

        const server = topology.s.servers.get(appError.address);

        const res = promisify(server.command.bind(server))(ns('admin.$cmd'), { ping: 1 }, {});
        const thrownError = await res.catch(error => error);

        withConnectionStub.restore();

        const isApplicationError = error => {
          // These errors all come from the withConnection stub
          return (
            error instanceof MongoNetworkError ||
            error instanceof MongoNetworkTimeoutError ||
            error instanceof MongoServerError
          );
        };
        expect(
          thrownError,
          'expected the error thrown to be one of MongoNetworkError, MongoNetworkTimeoutError or MongoServerError (referred to in the spec as an "Application Error")'
        ).to.satisfy(isApplicationError);
      }
    }
  }
}

function withConnectionStubImpl(appError) {
  return function (conn, fn, callback) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

    if (description.type === TopologyType.LoadBalanced) {
      // Load balancer mode has no monitor hello response and
      // only expects address and compatible to be set in the
      // server description.
      if (key !== 'address' && key !== 'compatible') {
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
        expect(topology.description[key]).to.be.undefined;
      } else {
        expect(topology.description).property(key).to.equal(outcomeValue);
      }

      continue;
    }

    if (key === 'logicalSessionTimeoutMinutes') {
      // logicalSessionTimeoutMinutes is always defined
      // but can be initialized to undefined
      expect(description).to.have.property(
        'logicalSessionTimeoutMinutes',
        outcomeValue ?? undefined
      );
      continue;
    }

    expect(description).to.include.keys(key);
    expect(description).to.have.deep.property(key, outcomeValue);
  }
}
