'use strict';

const expect = require('chai').expect;
const ReplSet = require('../../../../lib/topologies/replset');
const ReadPreference = require('../../../../lib/topologies/read_preference');
const mock = require('mongodb-mock-server');
const ReplSetFixture = require('../common').ReplSetFixture;

describe('Secondaries (ReplSet)', function() {
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
});
