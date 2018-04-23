'use strict';
const path = require('path');
const fs = require('fs');
const Topology = require('../../../lib/sdam/topology').Topology;
const ServerDescription = require('../../../lib/sdam/server_description').ServerDescription;
const ServerType = require('../../../lib/sdam/server_description').ServerType;
const ServerSelectors = require('../../../lib/sdam/server_selectors');
const MongoTimeoutError = require('../../../lib/error').MongoTimeoutError;
const ReadPreference = require('../../../lib/topologies/read_preference');

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-subset'));

const specDir = path.join(__dirname, '..', 'spec', 'server-selection', 'server_selection');
function collectTests() {
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
            const subTypeData = JSON.parse(
              fs.readFileSync(path.join(specDir, testType, subType, f))
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
  const specTests = collectTests();

  Object.keys(specTests).forEach(topologyType => {
    describe(topologyType, function() {
      Object.keys(specTests[topologyType]).forEach(subType => {
        describe(subType, function() {
          specTests[topologyType][subType].forEach(test => {
            // NOTE: node does not support PossiblePrimary
            const maybeIt = test.name.match(/Possible/) ? it.skip : it;

            maybeIt(test.name, function(done) {
              executeServerSelectionTest(test, done);
            });
          });
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

  // default max wire version is `6`
  fakeIsMaster.maxWireVersion = fakeIsMaster.maxWireVersion || 6;

  return new ServerDescription(definition.address, fakeIsMaster, {
    roundTripTime: definition.avg_rtt_ms
  });
}

function readPreferenceFromDefinition(definition) {
  const mode = definition.mode.charAt(0).toLowerCase() + definition.mode.slice(1);
  const options = {};
  if (definition.maxStalenessSeconds) options.maxStalenessSeconds = definition.maxStalenessSeconds;
  const tags = definition.tag_sets || [];

  return new ReadPreference(mode, tags, options);
}

function executeServerSelectionTest(testDefinition, done) {
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

  // "Eligible servers" is defined in the server selection spec as
  // the set of servers matching both the ReadPreference's mode
  // and tag sets.
  const latencyTopology = new Topology(seedData.seedlist, topologyOptions);
  latencyTopology.connect();

  // "In latency window" is defined in the server selection
  // spec as the subset of suitable_servers that falls within the
  // allowable latency window.
  topologyOptions.localThresholdMS = 1000000;
  const suitableTopology = new Topology(seedData.seedlist, topologyOptions);
  suitableTopology.connect();

  // Update topologies with server descriptions.
  topologyDescription.servers.forEach(server => {
    const serverDescription = serverDescriptionFromDefinition(server, seedData.hosts);
    suitableTopology.update(serverDescription);
    latencyTopology.update(serverDescription);
  });

  let selector;
  if (testDefinition.operation === 'write') {
    selector = ServerSelectors.writableServerSelector();
  } else if (testDefinition.operation === 'read') {
    const readPreference = readPreferenceFromDefinition(testDefinition.read_preference);
    selector = ServerSelectors.readPreferenceServerSelector(readPreference);
  } else {
    return done('invalid operation: ', testDefinition.operation);
  }

  // expectations
  const suitableServers = testDefinition.suitable_servers.map(s =>
    serverDescriptionFromDefinition(s)
  );

  // default to serverSelectionTimeoutMS of `0` for unit tests
  suitableTopology.selectServer(selector, { serverSelectionTimeoutMS: 0 }, (err, server) => {
    if (err) {
      if (suitableServers.length === 0 && err instanceof MongoTimeoutError) return done();
      return done(err);
    }

    if (suitableServers.length === 0 && server !== null) {
      return done(new Error('Found server, but expected none!'));
    }

    const selectedServerDescription = server.description;

    try {
      const expectedServerArray = suitableServers.filter(
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
