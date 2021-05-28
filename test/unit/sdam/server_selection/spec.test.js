'use strict';
const path = require('path');
const fs = require('fs');
const { Topology } = require('../../../../src/sdam/topology');
const { Server } = require('../../../../src/sdam/server');
const { ServerType, TopologyType } = require('../../../../src/sdam/common');
const { ServerDescription } = require('../../../../src/sdam/server_description');
const { ReadPreference } = require('../../../../src/read_preference');
const { MongoServerSelectionError } = require('../../../../src/error');
const ServerSelectors = require('../../../../src/sdam/server_selection');

const { EJSON } = require('bson');

const sinon = require('sinon');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const selectionSpecDir = path.join(__dirname, '../../../spec/server-selection/server_selection');
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
            // TODO: Re-enable LoadBalanced in NODE-3011
            const maybeIt =
              test.name.match(/Possible/) || topologyType === 'LoadBalanced' ? it.skip : it;

            maybeIt(test.name, function (done) {
              executeServerSelectionTest(test, { checkLatencyWindow: false }, done);
            });
          });
        });

        describe(subType + ' (within latency window)', function () {
          specTests[topologyType][subType].forEach(test => {
            // NOTE: node does not support PossiblePrimary
            // TODO: Re-enable LoadBalanced in NODE-3011
            const maybeIt =
              test.name.match(/Possible/) || topologyType === 'LoadBalanced' ? it.skip : it;

            maybeIt(test.name, function (done) {
              executeServerSelectionTest(test, { checkLatencyWindow: true }, done);
            });
          });
        });
      });
    });
  });
});

const maxStalenessDir = path.join(__dirname, '../../../spec/max-staleness');
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
        it(testData.description, {
          metadata: { requires: { topology: 'single' } },
          test: function (done) {
            executeServerSelectionTest(testData, { checkLatencyWindow: false }, done);
          }
        });
      });
    });
  });
});

function serverDescriptionFromDefinition(definition, hosts) {
  hosts = hosts || [];

  const serverType = definition.type;

  if (serverType === ServerType.Unknown) {
    return new ServerDescription(definition.address);
  }

  // There's no monitor in load balanced mode so no fake hello
  // is needed.
  if (serverType === ServerType.LoadBalancer) {
    const description = new ServerDescription(definition.address, undefined, {
      loadBalanced: true
    });
    delete description.lastUpdateTime;
    return description;
  }

  const fakeIsMaster = { ok: 1, hosts };
  if (serverType !== ServerType.Standalone && serverType !== ServerType.Mongos) {
    fakeIsMaster.setName = 'rs';
  }

  if (serverType === ServerType.RSPrimary) {
    fakeIsMaster.ismaster = true;
  } else if (serverType === ServerType.RSSecondary) {
    fakeIsMaster.secondary = true;
  } else if (serverType === ServerType.Mongos) {
    fakeIsMaster.msg = 'isdbgrid';
  }

  ['maxWireVersion', 'tags', 'idleWritePeriodMillis'].forEach(field => {
    if (definition[field]) {
      fakeIsMaster[field] = definition[field];
    }
  });

  fakeIsMaster.lastWrite = definition.lastWrite;

  // default max wire version is `6`
  fakeIsMaster.maxWireVersion = fakeIsMaster.maxWireVersion || 6;

  const serverDescription = new ServerDescription(definition.address, fakeIsMaster, {
    roundTripTime: definition.avg_rtt_ms
  });

  // source of flakiness, if we don't need it then remove it
  if (typeof definition.lastUpdateTime !== 'undefined') {
    serverDescription.lastUpdateTime = definition.lastUpdateTime;
  } else {
    delete serverDescription.lastUpdateTime;
  }

  return serverDescription;
}

function readPreferenceFromDefinition(definition) {
  const mode = definition.mode
    ? definition.mode.charAt(0).toLowerCase() + definition.mode.slice(1)
    : 'primary';

  const options = {};
  if (typeof definition.maxStalenessSeconds !== 'undefined')
    options.maxStalenessSeconds = definition.maxStalenessSeconds;
  const tags = definition.tag_sets || [];

  return new ReadPreference(mode, tags, options);
}

function executeServerSelectionTest(testDefinition, options, testDone) {
  const topologyDescription = testDefinition.topology_description;
  const seedData = topologyDescription.servers.reduce(
    (result, seed) => {
      result.seedlist.push(seed.address);
      result.hosts.push(seed.address);
      return result;
    },
    { seedlist: [], hosts: [] }
  );

  const topologyOptions = {
    heartbeatFrequencyMS: testDefinition.heartbeatFrequencyMS,
    monitorFunction: () => {},
    loadBalanced: topologyDescription.type === TopologyType.LoadBalanced
  };

  const topology = new Topology(seedData.seedlist, topologyOptions);
  // Each test will attempt to connect by doing server selection. We want to make the first
  // call to `selectServers` call a fake, and then immediately restore the original behavior.
  let topologySelectServers = sinon
    .stub(Topology.prototype, 'selectServer')
    .callsFake(function (selector, options, callback) {
      topologySelectServers.restore();

      const fakeServer = { s: { state: 'connected' }, removeListener: () => {} };
      callback(undefined, fakeServer);
    });

  function done(err) {
    topology.close(e => testDone(e || err));
  }

  topology.connect(err => {
    expect(err).to.not.exist;

    // Update topologies with server descriptions.
    topologyDescription.servers.forEach(server => {
      const serverDescription = serverDescriptionFromDefinition(server, seedData.hosts);
      topology.serverUpdateHandler(serverDescription);
    });

    let selector;
    if (testDefinition.operation === 'write') {
      selector = ServerSelectors.writableServerSelector();
    } else if (testDefinition.operation === 'read' || testDefinition.read_preference) {
      try {
        const readPreference = readPreferenceFromDefinition(testDefinition.read_preference);
        selector = ServerSelectors.readPreferenceServerSelector(readPreference);
      } catch (e) {
        if (testDefinition.error) return done();
        return done(e);
      }
    }

    // expectations
    let expectedServers;
    if (!testDefinition.error) {
      if (options.checkLatencyWindow) {
        expectedServers = testDefinition.in_latency_window.map(s =>
          serverDescriptionFromDefinition(s)
        );
      } else {
        expectedServers = testDefinition.suitable_servers.map(s =>
          serverDescriptionFromDefinition(s)
        );
      }
    }

    // default to serverSelectionTimeoutMS of `100` for unit tests
    topology.selectServer(selector, { serverSelectionTimeoutMS: 50 }, (err, server) => {
      // are we expecting an error?
      if (testDefinition.error) {
        if (!err) {
          return done(new Error('Expected an error, but found none!'));
        }

        return done();
      }

      if (err) {
        // this is another expected error case
        if (expectedServers.length === 0 && err instanceof MongoServerSelectionError) return done();
        return done(err);
      }

      if (expectedServers.length === 0 && server !== null) {
        return done(new Error('Found server, but expected none!'));
      }

      const selectedServerDescription = server.description;

      try {
        const expectedServerArray = expectedServers.filter(
          s => s.address === selectedServerDescription.address
        );

        if (!expectedServerArray.length) {
          return done(new Error('No suitable servers found!'));
        }

        expect(selectedServerDescription).to.include.containSubset(expectedServerArray[0]);
        done();
      } catch (e) {
        done(e);
      }
    });
  });
}
