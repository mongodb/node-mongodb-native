'use strict';
var Server = require('../../../../lib/topologies/server'),
  Long = require('bson').Long,
  ObjectId = require('bson').ObjectId,
  expect = require('chai').expect,
  assign = require('../../../../lib/utils').assign,
  mock = require('../../../mock'),
  genClusterTime = require('../common').genClusterTime,
  ClientSession = require('../../../../lib/sessions').ClientSession,
  ServerSessionPool = require('../../../../lib/sessions').ServerSessionPool;

const test = {};
describe('Sessions (Single)', function() {
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
      const sessionPool = new ServerSessionPool(client);
      const session = new ClientSession(client, sessionPool);

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
      let sentIsMaster = false,
        command = null;

      test.server.setMessageHandler(request => {
        if (sentIsMaster) {
          command = request.document;
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
          expect(command.$clusterTime).to.eql(clusterTime);

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

      let sentIsMaster = false,
        command = null;
      test.server.setMessageHandler(request => {
        if (sentIsMaster) {
          command = request.document;
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
      const sessionPool = new ServerSessionPool(client);
      const session = new ClientSession(client, sessionPool, {
        initialClusterTime: futureClusterTime
      });

      client.on('error', done);
      client.once('connect', () => {
        client.command('admin.$cmd', { ping: 1 }, { session: session }, err => {
          expect(err).to.not.exist;
          expect(command.$clusterTime).to.eql(futureClusterTime);
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

  it('should add `lsid` to commands sent to the server with a session', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const client = new Server(test.server.address());
      const sessionPool = new ServerSessionPool(client);
      const session = new ClientSession(client, sessionPool);

      let sentIsMaster = false,
        command = null;
      test.server.setMessageHandler(request => {
        if (sentIsMaster) {
          command = request.document;
          request.reply({ ok: 1 });
          return;
        }

        sentIsMaster = true;
        request.reply(
          assign({}, mock.DEFAULT_ISMASTER, {
            maxWireVersion: 6
          })
        );
      });

      client.on('error', done);
      client.once('connect', () => {
        client.command('admin.$cmd', { ping: 1 }, { session: session }, err => {
          expect(err).to.not.exist;
          expect(command.document.lsid).to.eql(session.id);
          done();
        });
      });

      client.connect();
    }
  });

  it('should use the same session for all getMore issued by a cursor', {
    metadata: { requires: { topology: 'single' } },
    test: function(done) {
      const client = new Server(test.server.address());
      const sessionPool = new ServerSessionPool(client);
      const session = new ClientSession(client, sessionPool);

      let commands = [];
      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            assign({}, mock.DEFAULT_ISMASTER, {
              maxWireVersion: 6
            })
          );
        } else if (doc.find) {
          commands.push(doc);
          request.reply({
            cursor: {
              id: Long.fromNumber(1),
              ns: 'test.t',
              firstBatch: []
            },
            ok: 1
          });
        } else if (doc.getMore) {
          commands.push(doc);
          request.reply({
            cursor: {
              id: Long.ZERO,
              ns: 'test.t',
              nextBatch: [{ _id: new ObjectId(), a: 1 }]
            },
            ok: 1
          });
        }
      });

      client.on('error', done);
      client.once('connect', () => {
        const cursor = client.cursor(
          'test.test',
          {
            find: 'test',
            query: {},
            batchSize: 2
          },
          {
            session: session
          }
        );

        // Execute next
        cursor.next(function(err) {
          expect(err).to.not.exist;
          expect(commands[0].lsid).to.eql(session.id);

          cursor.next(function(err) {
            expect(err).to.not.exist;
            expect(commands[1].lsid).to.eql(session.id);

            client.destroy();
            done();
          });
        });
      });

      client.connect();
    }
  });
});
