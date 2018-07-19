'use strict';

const expect = require('chai').expect;
const ReplSet = require('../../../../lib/topologies/replset');
const ReadPreference = require('../../../../lib/topologies/read_preference');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;
const ReplSetState = require('../../../../lib/topologies/replset_state');
const MongoError = require('../../../..').MongoError;

describe('ReadPreference (ReplSet)', function() {
  let test;
  before(() => (test = new ReplSetFixture()));
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup());

  it('Should not be "connected" with ReadPreference secondary unless secondary is connected', {
    metadata: {
      requires: {
        topology: 'single'
      }
    },

    test: function(done) {
      const replSet = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      replSet.on('error', done);

      replSet.on('connect', server => {
        let err;
        try {
          expect(server.s.replicaSetState.hasSecondary()).to.equal(true);
        } catch (e) {
          err = e;
        }

        replSet.destroy();
        done(err);
      });

      replSet.connect({ readPreference: new ReadPreference('secondary') });
    }
  });

  it('should correctly sort servers by `lastIsMasterMS` during nearest selection', function() {
    const state = new ReplSetState();
    const sampleData = [
      { type: 'RSPrimary', lastIsMasterMS: 5 },
      { type: 'RSSecondary', lastIsMasterMS: 4 },
      { type: 'RSSecondary', lastIsMasterMS: 4 },
      { type: 'RSSecondary', lastIsMasterMS: 109 },
      { type: 'RSSecondary', lastIsMasterMS: 110 },
      { type: 'RSSecondary', lastIsMasterMS: 110 },
      { type: 'RSSecondary', lastIsMasterMS: 245 },
      { type: 'RSSecondary', lastIsMasterMS: 221 },
      { type: 'RSSecondary', lastIsMasterMS: 199 },
      { type: 'RSSecondary', lastIsMasterMS: 129 },
      { type: 'RSSecondary', lastIsMasterMS: 131 },
      { type: 'RSSecondary', lastIsMasterMS: 284 },
      { type: 'RSSecondary', lastIsMasterMS: 298 },
      { type: 'RSSecondary', lastIsMasterMS: 289 },
      { type: 'RSSecondary', lastIsMasterMS: 312 }
    ];

    // load mock data into replset state
    sampleData.forEach(desc => {
      desc.ismaster = { maxWireVersion: 6 }; // for maxStalenessSeconds test
      desc.staleness = Math.floor(Math.random() * 100);

      if (desc.type === 'RSPrimary') {
        state.primary = desc;
      } else {
        state.secondaries.push(desc);
      }
    });

    // select the nearest server without max staleness seconds
    let server = state.pickServer(ReadPreference.nearest);
    expect(server).to.not.be.an.instanceOf(MongoError);
    expect(server.lastIsMasterMS).to.equal(4);

    // select the nearest server with max staleness seconds
    server = state.pickServer(new ReadPreference('nearest', { maxStalenessSeconds: 100 }));
    expect(server).to.not.be.an.instanceOf(MongoError);
    expect(server.lastIsMasterMS).to.equal(4);
  });
});
