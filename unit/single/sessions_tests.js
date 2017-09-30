'use strict';
var Server = require('../../../../lib/topologies/server'),
  expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  mock = require('../../../mock'),
  genClusterTime = require('../common').genClusterTime,
  ClientSession = require('../../../../lib/sessions').ClientSession;

const test = {};
describe('Sessions (Single)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer(37019, 'localhost').then(mockServer => {
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
            $clusterTime: clusterTime
          })
        );
      });

      const client = new Server(test.server.address());
      client.on('error', done);
      client.once('connect', () => {
        expect(client.clusterTime).to.eql(clusterTime);
        client.destroy();
        done();
      });

      client.connect();
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

      const client = new Server(test.server.address());
      client.on('error', done);
      client.once('connect', () => {
        expect(client.clusterTime).to.exist;
        expect(client.clusterTime).to.eql(clusterTime);

        client.insert('test.test', [{ created: new Date() }], function(err) {
          expect(err).to.not.exist;
          expect(client.clusterTime).to.exist;
          expect(client.clusterTime).to.not.eql(clusterTime);
          expect(client.clusterTime).to.eql(futureClusterTime);

          client.destroy();
          done();
        });
      });

      client.connect();
    }
  });

  it('should track the highest `$clusterTime` seen, and store it on a session if available', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now()),
        futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            assign({}, mock.DEFAULT_ISMASTER, {
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

      const client = new Server(test.server.address());
      const session = new ClientSession(client);

      client.on('error', done);
      client.once('connect', () => {
        expect(client.clusterTime).to.exist;
        expect(client.clusterTime).to.eql(clusterTime);

        client.insert('test.test', [{ created: new Date() }], { session: session }, function(err) {
          expect(err).to.not.exist;
          expect(client.clusterTime).to.exist;
          expect(client.clusterTime).to.not.eql(clusterTime);
          expect(client.clusterTime).to.eql(futureClusterTime);
          expect(session.clusterTime).to.eql(futureClusterTime);

          client.destroy();
          done();
        });
      });

      client.connect();
    }
  });

  it('should send `clusterTime` on outgoing messages', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now());
      let sentIsMaster = false;
      test.server.setMessageHandler(request => {
        if (sentIsMaster) {
          expect(request.document.$clusterTime).to.eql(clusterTime);
          request.reply({ ok: 1 });
          return;
        }

        sentIsMaster = true;
        request.reply(
          assign({}, mock.DEFAULT_ISMASTER, {
            maxWireVersion: 6,
            $clusterTime: clusterTime
          })
        );
      });

      const client = new Server(test.server.address());
      client.on('error', done);
      client.once('connect', () => {
        client.command('admin.$cmd', { ping: 1 }, err => {
          expect(err).to.not.exist;
          done();
        });
      });

      client.connect();
    }
  });

  it('should send the highest `clusterTime` between topology and session if it exists', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const clusterTime = genClusterTime(Date.now()),
        futureClusterTime = genClusterTime(Date.now() + 10 * 60 * 1000);

      let sentIsMaster = false;
      test.server.setMessageHandler(request => {
        if (sentIsMaster) {
          expect(request.document.$clusterTime).to.eql(futureClusterTime);
          request.reply({ ok: 1 });
          return;
        }

        sentIsMaster = true;
        request.reply(
          assign({}, mock.DEFAULT_ISMASTER, {
            maxWireVersion: 6,
            $clusterTime: clusterTime
          })
        );
      });

      const client = new Server(test.server.address());
      const session = new ClientSession(client, { initialClusterTime: futureClusterTime });
      client.on('error', done);
      client.once('connect', () => {
        client.command('admin.$cmd', { ping: 1 }, { session: session }, err => {
          expect(err).to.not.exist;
          done();
        });
      });

      client.connect();
    }
  });

  it('should default `logicalSessionTimeoutMinutes` to `null`', {
    metadata: { requires: { topology: 'single' } },
    test: function() {
      const single = new Server();
      expect(single.logicalSessionTimeoutMinutes).to.equal(null);
    }
  });

  it('should track `logicalSessionTimeoutMinutes`', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      test.server.setMessageHandler(request => {
        request.reply(
          assign({}, mock.DEFAULT_ISMASTER, {
            logicalSessionTimeoutMinutes: 10
          })
        );
      });

      var client = new Server(test.server.address());
      client.on('error', done);
      client.once('connect', () => {
        expect(client.logicalSessionTimeoutMinutes).to.equal(10);
        client.destroy();
        done();
      });

      client.connect();
    }
  });
});
