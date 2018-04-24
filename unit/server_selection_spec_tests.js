'use strict';
const path = require('path');
const fs = require('fs');
const Topology = require('../../../lib/sdam/topology').Topology;
const ServerDescription = require('../../../lib/sdam/server_description').ServerDescription;
const ServerType = require('../../../lib/sdam/server_description').ServerType;
const ServerSelectors = require('../../../lib/sdam/server_selectors');
const MongoTimeoutError = require('../../../lib/error').MongoTimeoutError;
const ReadPreference = require('../../../lib/topologies/read_preference');
const EJSON = require('mongodb-extjson');

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const selectionSpecDir = path.join(__dirname, '..', 'spec', 'server-selection', 'server_selection');
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

describe('Server Selection (spec)', function() {
  const specTests = collectSelectionTests(selectionSpecDir);

  Object.keys(specTests).forEach(topologyType => {
    describe(topologyType, function() {
      Object.keys(specTests[topologyType]).forEach(subType => {
        describe(subType, function() {
          specTests[topologyType][subType].forEach(test => {
            // NOTE: node does not support PossiblePrimary
            const maybeIt = test.name.match(/Possible/) ? it.skip : it;

            maybeIt(test.name, function(done) {
              executeServerSelectionTest(test, { checkLatencyWindow: false }, done);
            });
          });
        });

        describe(subType + ' (within latency window)', function() {
          specTests[topologyType][subType].forEach(test => {
            // NOTE: node does not support PossiblePrimary
            const maybeIt = test.name.match(/Possible/) ? it.skip : it;

            maybeIt(test.name, function(done) {
              executeServerSelectionTest(test, { checkLatencyWindow: true }, done);
            });
          });
        });
      });
    });
  });
});

const maxStalenessDir = path.join(__dirname, '..', 'spec', 'max-staleness');
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

describe('Max Staleness (spec)', function() {
  const specTests = collectStalenessTests(maxStalenessDir);

  Object.keys(specTests).forEach(specTestName => {
    describe(specTestName, () => {
      specTests[specTestName].forEach(testData => {
        it(testData.description, {
          metadata: { requires: { topology: 'single' } },
          test: function(done) {
            executeServerSelectionTest(testData, { checkLatencyWindow: false }, done);
          }
        });
      });
    });
  });
});

function normalizeSeed(seed) {
  let host = seed;
  let port = 27017;

  // is this a host + port combo?
  if (seed.indexOf(':') !== -1) {
    host = seed.split(':')[0];
    port = parseInt(seed.split(':')[1], 10);
  }

  // support IPv6
  if (host.startsWith('[')) {
    host = host.slice(1, host.length - 1);
  }

  return { host, port };
}

function serverDescriptionFromDefinition(definition, hosts) {
  const serverType = definition.type;
  if (serverType === ServerType.Unknown) {
    return new ServerDescription(definition.address);
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

function executeServerSelectionTest(testDefinition, options, done) {
  const topologyDescription = testDefinition.topology_description;
  const seedData = topologyDescription.servers.reduce(
    (result, seed) => {
      result.seedlist.push(normalizeSeed(seed.address));
      result.hosts.push(seed.address);
      return result;
    },
    { seedlist: [], hosts: [] }
  );

  const topologyOptions = {
    heartbeatFrequencyMS: testDefinition.heartbeatFrequencyMS
  };

  const topology = new Topology(seedData.seedlist, topologyOptions);
  topology.connect();

  // Update topologies with server descriptions.
  topologyDescription.servers.forEach(server => {
    const serverDescription = serverDescriptionFromDefinition(server, seedData.hosts);
    topology.update(serverDescription);
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

  // default to serverSelectionTimeoutMS of `0` for unit tests
  topology.selectServer(selector, { serverSelectionTimeoutMS: 0 }, (err, server) => {
    // are we expecting an error?
    if (testDefinition.error) {
      if (!err) {
        return done(new Error('Expected an error, but found none!'));
      }

      return done();
    }

    if (err) {
      // this is another expected error case
      if (expectedServers.length === 0 && err instanceof MongoTimeoutError) return done();
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
}
