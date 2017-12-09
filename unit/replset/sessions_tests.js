'use strict';
var expect = require('chai').expect,
  ReplSet = require('../../../../lib/topologies/replset'),
  mock = require('../../../mock'),
  genClusterTime = require('../common').genClusterTime,
  ReplSetFixture = require('../common').ReplSetFixture;

const test = new ReplSetFixture();
describe('Sessions (ReplSet)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => test.setup({ ismaster: mock.DEFAULT_ISMASTER_36 }));

  it('should track the highest `clusterTime` seen in a replica set', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now()),
        futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

      test.primaryStates[0].$clusterTime = clusterTime;
      test.firstSecondaryStates[0].$clusterTime = futureClusterTime;
      test.arbiterStates[0].$clusterTime = futureClusterTime;

      var replset = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      replset.on('all', () => {
        expect(replset.clusterTime).to.eql(futureClusterTime);
        replset.destroy();
        done();
      });

      replset.on('error', done);
      replset.connect();
    }
  });

  it('should report the deployment clusterTime for Server topologies in a ReplSet topology', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now()),
        futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

      test.primaryStates[0].$clusterTime = clusterTime;
      test.firstSecondaryStates[0].$clusterTime = futureClusterTime;
      test.arbiterStates[0].$clusterTime = futureClusterTime;

      var replset = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      replset.on('all', () => {
        expect(replset.clusterTime).to.eql(futureClusterTime);
        const servers = replset.s.replicaSetState.secondaries
          .concat(replset.s.replicaSetState.arbiters)
          .concat([replset.s.replicaSetState.primary]);
        servers.forEach(server => expect(server.clusterTime).to.eql(futureClusterTime));

        replset.destroy();
        done();
      });

      replset.on('error', done);
      replset.connect();
    }
  });

  it('should set `logicalSessionTimeoutMinutes` to `null` if any incoming server is `null`', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      test.firstSecondaryStates[0].logicalSessionTimeoutMinutes = null;

      const replset = new ReplSet(
        [test.primaryServer.address(), test.firstSecondaryServer.address()],
        {
          setName: 'rs',
          connectionTimeout: 3000,
          socketTimeout: 0,
          haInterval: 100,
          size: 1
        }
      );

      replset.on('error', done);
      replset.once('all', () => {
        expect(replset.logicalSessionTimeoutMinutes).to.equal(null);
        replset.destroy();
        done();
      });

      replset.connect();
    }
  });

  it(
    'should track `logicalSessionTimeoutMinutes` for replset topology, choosing the lowest value',
    {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        test.primaryStates[0].logicalSessionTimeoutMinutes = 426;
        test.firstSecondaryStates[0].logicalSessionTimeoutMinutes = 1;
        test.arbiterStates[0].logicalSessionTimeoutMinutes = 32;

        const replset = new ReplSet(
          [test.primaryServer.address(), test.firstSecondaryServer.address()],
          {
            setName: 'rs',
            connectionTimeout: 3000,
            socketTimeout: 0,
            haInterval: 100,
            size: 1
          }
        );

        replset.on('all', () => {
          expect(replset.logicalSessionTimeoutMinutes).to.equal(1);
          replset.destroy();
          done();
        });

        replset.on('error', done);
        replset.connect();
      }
    }
  );

  it('should exclude arbiters when tracking `logicalSessionTimeoutMinutes`', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      test.arbiterServer.setMessageHandler(req => {
        const doc = req.document;
        if (doc.ismaster) {
          req.reply(Object.assign({}, test.arbiterStates[0], { logicalSessionTimeoutMinutes: 2 }));
        }
      });

      const replset = new ReplSet(test.servers.map(s => s.address()), {
        setName: 'rs',
        connectionTimeout: 3000,
        socketTimeout: 0,
        haInterval: 100,
        size: 1
      });

      replset.on('joined', type => {
        if (type === 'arbiter') {
          expect(replset.logicalSessionTimeoutMinutes).to.equal(10);
          done();
        }
      });

      replset.on('error', done);
      replset.connect();
    }
  });
});
