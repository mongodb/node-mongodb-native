import { EJSON, ObjectId } from 'bson';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';

import {
  ConnectionPool,
  HEARTBEAT_EVENTS,
  isRecord,
  MongoClient,
  MongoCompatibilityError,
  MongoError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoServerError,
  ns,
  Server,
  SERVER_CLOSED,
  SERVER_DESCRIPTION_CHANGED,
  SERVER_OPENING,
  ServerClosedEvent,
  ServerDescription,
  ServerDescriptionChangedEvent,
  ServerHeartbeatFailedEvent,
  ServerHeartbeatStartedEvent,
  ServerHeartbeatSucceededEvent,
  ServerOpeningEvent,
  squashError,
  Topology,
  TOPOLOGY_CLOSED,
  TOPOLOGY_DESCRIPTION_CHANGED,
  TOPOLOGY_OPENING,
  TopologyClosedEvent,
  TopologyDescriptionChangedEvent,
  TopologyOpeningEvent,
  type TopologyVersion
} from '../../mongodb';
import { ejson } from '../../tools/utils';

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
} as const;

const WIRE_VERSION_KEYS = new Set(['minWireVersion', 'maxWireVersion']);

const specDir = path.resolve(__dirname, '../../spec/server-discovery-and-monitoring');
function collectTests(): Record<string, SDAMTest[]> {
  const testTypes = fs
    .readdirSync(specDir)
    .filter(d => fs.statSync(path.resolve(specDir, d)).isDirectory())
    .filter(d => d !== 'unified');

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

interface SDAMTest {
  description: string;
  uri: string;
  phases: SDAMPhase[];
}
/**
 * A phase of the test optionally sends inputs to the client,
 * then tests the client's resulting TopologyDescription.
 */
type SDAMPhase =
  | {
      description?: string;
      applicationErrors: ApplicationError[];
      outcome: TopologyDescriptionOutcome;
    }
  | {
      description?: string;
      responses?: SDAMResponse[];
      outcome: MonitoringOutcome | TopologyDescriptionOutcome;
    };

interface MonitoringOutcome {
  events: (typeof SDAM_EVENT_CLASSES)[keyof typeof SDAM_EVENT_CLASSES][];
}
interface OutcomeServerDescription {
  type?: string;
  setName?: string;
  error?: { message: string };
  setVersion?: number;
  electionId?: ObjectId | null;
  logicalSessionTimeoutMinutes?: number;
  minWireVersion?: number;
  maxWireVersion?: number;
  topologyVersion?: TopologyVersion;
  pool?: { generation: number };
}
interface TopologyDescriptionOutcome {
  topologyType: string;
  setName?: string;
  servers?: Record<string, OutcomeServerDescription>;
  logicalSessionTimeoutMinutes?: number;
  maxSetVersion?: number;
  maxElectionId?: ObjectId;
  compatible: false | undefined;
}
type SDAMResponse = [serverAddress: string, hello: Document];
type ApplicationErrorCommon = {
  address: string;
  generation?: number;
  maxWireVersion?: number;
  when: 'beforeHandshakeCompletes' | 'afterHandshakeCompletes';
};
type ApplicationError =
  | (ApplicationErrorCommon & { type: 'network' | 'timeout' })
  | (ApplicationErrorCommon & { type: 'command'; response: Document });

function isTopologyDescriptionOutcome(outcome: any): outcome is TopologyDescriptionOutcome {
  try {
    assertTopologyDescriptionOutcome(outcome);
    return true;
  } catch {
    return false;
  }
}

function assertTopologyDescriptionOutcome(
  outcome: any
): asserts outcome is TopologyDescriptionOutcome {
  expect(outcome).to.be.an('object').that.is.not.null;
  expect(outcome).to.have.property('topologyType').that.is.a('string');
  expect(outcome).to.have.property('servers').that.is.an('object');
  // The type annotation helps keep this sync-ed with the typescript interface
  const knownTopologyDescriptionOutcomeKeys: ReadonlyArray<keyof TopologyDescriptionOutcome> = [
    'topologyType',
    'setName',
    'servers',
    'logicalSessionTimeoutMinutes',
    'maxSetVersion',
    'maxElectionId',
    'compatible'
  ] as const;

  for (const key of Object.keys(outcome)) {
    // if outcome has an extra key we don't know about
    // we need to add an assertion for it in assertTopologyDescriptionOutcomeExpectations
    expect(knownTopologyDescriptionOutcomeKeys).to.include(key);
  }
}

function isMonitoringOutcome(outcome: any): outcome is MonitoringOutcome {
  try {
    assertMonitoringOutcome(outcome);
    return true;
  } catch {
    return false;
  }
}

function assertMonitoringOutcome(outcome: any): asserts outcome is MonitoringOutcome {
  expect(outcome).to.be.an('object').that.is.not.null;
  expect(outcome).to.have.property('events').that.is.an('array');
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
      let topologySelectServers: sinon.SinonStub;

      beforeEach(() => {
        // Each test will attempt to connect by doing server selection. We want to make the first
        // call to `selectServers` call a fake, and then immediately restore the original behavior.
        topologySelectServers = sinon
          .stub(Topology.prototype, 'selectServer')
          .callsFake(async function (_selector, _options) {
            topologySelectServers.restore();

            const fakeServer = { s: { state: 'connected' }, removeListener: () => true };
            return fakeServer;
          });
      });

      afterEach(() => {
        topologySelectServers.restore();
      });

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
  // Server events
  SERVER_DESCRIPTION_CHANGED,
  SERVER_OPENING,
  SERVER_CLOSED,
  // Topology events
  TOPOLOGY_DESCRIPTION_CHANGED,
  TOPOLOGY_OPENING,
  TOPOLOGY_CLOSED,
  // Heartbeat events
  ...HEARTBEAT_EVENTS
];

async function executeSDAMTest(testData: SDAMTest) {
  const client = new MongoClient(testData.uri);
  // listen for SDAM monitoring events
  let events = [];
  for (const eventName of SDAM_EVENTS) {
    client.on(eventName, event => events.push(event));
  }

  let errorsThrown = [];
  client.on('error', error => errorsThrown.push(error));

  // connect the topology
  await client.connect();

  try {
    for (const phase of testData.phases) {
      // Determine which of the two kinds of phases we're running
      if ('responses' in phase && phase.responses != null) {
        // phase with responses for hello simulations
        for (const [address, hello] of phase.responses) {
          client.topology.serverUpdateHandler(new ServerDescription(address, hello));
        }
      } else if ('applicationErrors' in phase && phase.applicationErrors) {
        // phase with applicationErrors simulating error's from network, timeouts, server
        for (const appError of phase.applicationErrors) {
          // Stub will return appError to SDAM machinery
          const checkOutStub = sinon
            .stub(ConnectionPool.prototype, 'checkOut')
            .callsFake(checkoutStubImpl(appError));

          const server = client.topology.s.servers.get(appError.address);

          // Run a dummy command to encounter the error
          const res = server.command.bind(server)(ns('admin.$cmd'), { ping: 1 }, {});
          const thrownError = await res.catch(error => error);

          // Restore the stub before asserting anything in case of errors
          checkOutStub.restore();

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
            `expected the error thrown to be one of MongoNetworkError, MongoNetworkTimeoutError or MongoServerError (referred to in the spec as an "Application Error") got ${thrownError.name} ${thrownError.stack}`
          ).to.satisfy(isApplicationError);
        }
      } else if (phase.outcome != null && Object.keys(phase).length === 1) {
        // Load Balancer SDAM tests have no "work" to be done for the phase
      } else {
        expect.fail(ejson`Unknown phase shape - ${phase}`);
      }

      if ('outcome' in phase && phase.outcome != null) {
        if (isMonitoringOutcome(phase.outcome)) {
          // Test for monitoring events
          const expectedEvents = convertOutcomeEvents(phase.outcome.events);

          expect(events).to.have.length(expectedEvents.length);
          for (const [i, actualEvent] of Object.entries(events)) {
            const actualEventClone = cloneForCompare(actualEvent);
            expect(actualEventClone).to.matchMongoSpec(expectedEvents[i]);
          }
        } else if (isTopologyDescriptionOutcome(phase.outcome)) {
          // Test for SDAM machinery correctly changing the topology type among other properties
          assertTopologyDescriptionOutcomeExpectations(client.topology, phase.outcome);
          if (phase.outcome.compatible === false) {
            // driver specific error throwing
            if (testData.description === 'Multiple mongoses with large minWireVersion') {
              // TODO(DRIVERS-2250): There is test bug that causes two errors
              // this will start failing when the test is synced and fixed
              expect(errorsThrown).to.have.lengthOf(2);
            } else {
              expect(errorsThrown).to.have.lengthOf(1);
            }
            expect(errorsThrown[0]).to.be.instanceOf(MongoCompatibilityError);
            expect(errorsThrown[0].message).to.match(/but this version of the driver/);
          } else {
            // unset or true means no errors should be thrown
            expect(errorsThrown).to.be.empty;
          }
        } else {
          expect.fail(ejson`Unknown outcome shape - ${phase.outcome}`);
        }

        events = [];
        errorsThrown = [];
      }
    }
  } finally {
    await client.close().catch(squashError);
  }
}

function checkoutStubImpl(appError) {
  return async function () {
    const connectionPoolGeneration = this.generation;
    const fakeConnection = {
      generation:
        typeof appError.generation === 'number' ? appError.generation : connectionPoolGeneration,
      async command(_, __, ___) {
        if (appError.type === 'network') {
          throw new MongoNetworkError('test generated');
        } else if (appError.type === 'timeout') {
          throw new MongoNetworkTimeoutError('xxx timed out', {
            beforeHandshake: appError.when === 'beforeHandshakeCompletes'
          });
        } else {
          throw new MongoServerError(appError.response);
        }
      }
    };
    return fakeConnection;
  };
}

function assertTopologyDescriptionOutcomeExpectations(
  topology: Topology,
  outcome: TopologyDescriptionOutcome
) {
  assertTopologyDescriptionOutcome(outcome);
  // then verify the resulting outcome
  const description = topology.description;

  expect(description).to.have.property('type', outcome.topologyType);

  const expectedServers = new Map(Object.entries(outcome.servers));
  const actualServers = description.servers;
  expect(actualServers).to.be.instanceOf(Map);

  expect(actualServers).to.have.lengthOf(expectedServers.size);

  for (const serverName of expectedServers.keys()) {
    expect(actualServers).to.include.keys(serverName);
    const expectedServer = expectedServers.get(serverName);
    if (expectedServer == null) expect.fail(`Must have server defined for ${serverName}`);

    if (expectedServer.pool != null) {
      const expectedPool = expectedServer.pool;
      const actualServer = topology.s.servers.get(serverName);
      if (actualServer == null) expect.fail(`Must have server defined for ${serverName}`);
      const actualPoolGeneration = actualServer.pool;
      expect(actualPoolGeneration).to.have.property('generation', expectedPool.generation);
      delete expectedServer.pool;
    }

    const normalizedExpectedServer = normalizeServerDescription(expectedServer);
    const actualServer = actualServers.get(serverName);

    const entriesOnExpectedServer = Object.entries(normalizedExpectedServer);
    expect(entriesOnExpectedServer).to.not.be.empty;
    for (const [expectedKey, expectedValue] of entriesOnExpectedServer) {
      if (WIRE_VERSION_KEYS.has(expectedKey) && expectedValue === null) {
        // For wireVersion keys we default to zero instead of null
        expect(actualServer).to.have.property(expectedKey, 0);
      } else if (expectedKey !== 'error') {
        expect(actualServer).to.have.deep.property(expectedKey, expectedValue);
      } else {
        expect(typeof expectedValue).to.equal('string');
        expect(actualServer)
          .to.have.property(expectedKey)
          .instanceof(MongoError)
          .to.match(new RegExp(expectedValue as string));
      }
    }
  }

  if (outcome.maxElectionId != null) {
    expect(description).to.have.property('maxElectionId').that.is.instanceOf(ObjectId);
    const driverMaxId = description.maxElectionId?.toString('hex');
    const testMaxId = outcome.maxElectionId.toString('hex');
    // Much easier to debug a hex string mismatch
    expect(driverMaxId).to.equal(testMaxId);
  } else {
    expect(description).to.have.property('maxElectionId', null);
  }

  expect(description).to.have.property('setName', outcome.setName ?? null);
  expect(description).to.have.property('maxSetVersion', outcome.maxSetVersion ?? null);
  expect(description).to.have.property('compatible', outcome.compatible ?? true);
  expect(description).to.have.property(
    'logicalSessionTimeoutMinutes',
    outcome.logicalSessionTimeoutMinutes ?? null
  );
}
