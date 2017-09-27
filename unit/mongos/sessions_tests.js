'use strict';
var Mongos = require('../../../../lib/topologies/mongos'),
  expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  mock = require('../../../mock'),
  genClusterTime = require('../common').genClusterTime;

const test = {};
describe('Sessions (Mongos)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should recognize and set `clusterTime` on the topology', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now());
      test.server.setMessageHandler(request => {
        request.reply(
          assign({}, mock.DEFAULT_ISMASTER, {
            msg: 'isdbgrid',
            $clusterTime: clusterTime
          })
        );
      });

      const mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.clusterTime).to.eql(clusterTime);
        mongos.destroy();
        done();
      });

      mongos.connect();
    }
  });

  it('should track the highest `$clusterTime` seen', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now()),
        futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            assign({}, mock.DEFAULT_ISMASTER, {
              msg: 'isdbgrid',
              $clusterTime: clusterTime
            })
          );
        } else if (doc.insert) {
          request.reply({
            ok: 1,
            n: [],
            lastOp: new Date(),
            $clusterTime: futureClusterTime
          });
        }
      });

      const mongos = new Mongos([test.server.address()]);
      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.clusterTime).to.exist;
        expect(mongos.clusterTime).to.eql(clusterTime);

        mongos.insert('test.test', [{ created: new Date() }], function(err) {
          expect(err).to.not.exist;
          expect(mongos.clusterTime).to.exist;
          expect(mongos.clusterTime).to.not.eql(clusterTime);
          expect(mongos.clusterTime).to.eql(futureClusterTime);

          mongos.destroy();
          done();
        });
      });

      mongos.connect();
    }
  });

  it('should default `logicalSessionTimeoutMinutes` to `null`', {
    metadata: { requires: { topology: 'single' } },
    test: function() {
      const mongos = new Mongos([test.server.address()]);
      expect(mongos.logicalSessionTimeoutMinutes).to.equal(null);
    }
  });

  it('should track `logicalSessionTimeoutMinutes`', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      test.server.setMessageHandler(request => {
        request.reply(
          assign({}, mock.DEFAULT_ISMASTER, {
            msg: 'isdbgrid',
            logicalSessionTimeoutMinutes: 10
          })
        );
      });

      var mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        expect(mongos.logicalSessionTimeoutMinutes).to.equal(10);
        mongos.destroy();
        done();
      });

      mongos.connect();
    }
  });
});
