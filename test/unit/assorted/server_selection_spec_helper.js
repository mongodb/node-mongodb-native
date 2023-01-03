'use strict';
const { Topology } = require('../../mongodb');
const { ServerType, TopologyType } = require('../../mongodb');
const { ServerDescription } = require('../../mongodb');
const { ReadPreference } = require('../../mongodb');
const { MongoServerSelectionError } = require('../../mongodb');
const ServerSelectors = require('../../mongodb');

const sinon = require('sinon');
const { expect } = require('chai');

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

  const fakeHello = { ok: 1, hosts };
  if (serverType !== ServerType.Standalone && serverType !== ServerType.Mongos) {
    fakeHello.setName = 'rs';
  }

  if (serverType === ServerType.RSPrimary) {
    fakeHello.isWritablePrimary = true;
  } else if (serverType === ServerType.RSSecondary) {
    fakeHello.secondary = true;
  } else if (serverType === ServerType.Mongos) {
    fakeHello.msg = 'isdbgrid';
  }

  ['maxWireVersion', 'tags', 'idleWritePeriodMillis'].forEach(field => {
    if (definition[field]) {
      fakeHello[field] = definition[field];
    }
  });

  fakeHello.lastWrite = definition.lastWrite;

  // default max wire version is `6`
  fakeHello.maxWireVersion = fakeHello.maxWireVersion || 6;

  const serverDescription = new ServerDescription(definition.address, fakeHello, {
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

function executeServerSelectionTest(testDefinition, testDone) {
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
    topology.close({}, e => testDone(e || err));
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
    } else {
      return done(
        new Error('received neither read nor write, and did not receive a read preference')
      );
    }

    // expectations
    let expectedServers;
    if (!testDefinition.error) {
      expectedServers = testDefinition.in_latency_window.map(s =>
        serverDescriptionFromDefinition(s)
      );
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

        if (expectedServerArray.length > 1) {
          return done(new Error('This test does not support multiple expected servers'));
        }

        for (const [prop, value] of Object.entries(expectedServerArray[0])) {
          if (prop === 'hosts') {
            // we dynamically modify this prop during sever selection
            continue;
          }
          expect(selectedServerDescription[prop]).to.deep.equal(
            value,
            `Mismatched selected server "${prop}"`
          );
        }
        done();
      } catch (e) {
        done(e);
      }
    });
  });
}

module.exports = { executeServerSelectionTest, serverDescriptionFromDefinition };
