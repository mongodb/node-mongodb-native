'use strict';

const mock = require('mongodb-mock-server');
const expect = require('chai').expect;
const genClusterTime = require('./common').genClusterTime;
const sessionCleanupHandler = require('./common').sessionCleanupHandler;
const now = require('../../../lib/utils').now;

const core = require('../../../lib/core');
const Server = core.Server;
const ServerSessionPool = core.Sessions.ServerSessionPool;
const ServerSession = core.Sessions.ServerSession;
const ClientSession = core.Sessions.ClientSession;

let test = {};
describe('Sessions', function() {
  describe('ClientSession', function() {
    it('should throw errors with invalid parameters', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        expect(() => {
          new ClientSession();
        }).to.throw(/ClientSession requires a topology/);

        expect(() => {
          new ClientSession({});
        }).to.throw(/ClientSession requires a ServerSessionPool/);

        expect(() => {
          new ClientSession({}, {});
        }).to.throw(/ClientSession requires a ServerSessionPool/);
      }
    });

    it('should default to `null` for `clusterTime`', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const client = new Server();
        const sessionPool = new ServerSessionPool(client);
        const session = new ClientSession(client, sessionPool);
        done = sessionCleanupHandler(session, sessionPool, done);

        expect(session.clusterTime).to.not.exist;
        done();
      }
    });

    it('should set the internal clusterTime to `initialClusterTime` if provided', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const clusterTime = genClusterTime(Date.now());
        const client = new Server();
        const sessionPool = new ServerSessionPool(client);
        const session = new ClientSession(client, sessionPool, { initialClusterTime: clusterTime });
        done = sessionCleanupHandler(session, sessionPool, done);

        expect(session.clusterTime).to.eql(clusterTime);
        done();
      }
    });
  });

  describe('ServerSessionPool', function() {
    afterEach(() => {
      test.client.destroy();
      return mock.cleanup();
    });

    beforeEach(() => {
      return mock
        .createServer()
        .then(server => {
          test.server = server;
          test.server.setMessageHandler(request => {
            var doc = request.document;
            if (doc.ismaster) {
              request.reply(
                Object.assign({}, mock.DEFAULT_ISMASTER, { logicalSessionTimeoutMinutes: 10 })
              );
            }
          });
        })
        .then(() => {
          test.client = new Server(test.server.address());

          return new Promise((resolve, reject) => {
            test.client.once('error', reject);
            test.client.once('connect', resolve);
            test.client.connect();
          });
        });
    });

    it('should throw errors with invalid parameters', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        expect(() => {
          new ServerSessionPool();
        }).to.throw(/ServerSessionPool requires a topology/);
      }
    });

    it('should create a new session if the pool is empty', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const pool = new ServerSessionPool(test.client);
        done = sessionCleanupHandler(null, pool, done);
        expect(pool.sessions).to.have.length(0);

        const session = pool.acquire();
        expect(session).to.exist;
        expect(pool.sessions).to.have.length(0);
        pool.release(session);

        done();
      }
    });

    it('should reuse sessions which have not timed out yet on acquire', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const oldSession = new ServerSession();
        const pool = new ServerSessionPool(test.client);
        done = sessionCleanupHandler(null, pool, done);
        pool.sessions.push(oldSession);

        const session = pool.acquire();
        expect(session).to.exist;
        expect(session).to.eql(oldSession);
        pool.release(session);

        done();
      }
    });

    it('should remove sessions which have timed out on acquire, and return a fresh session', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const oldSession = new ServerSession();
        oldSession.lastUse = now() - 30 * 60 * 1000; // add 30min

        const pool = new ServerSessionPool(test.client);
        done = sessionCleanupHandler(null, pool, done);
        pool.sessions.push(oldSession);

        const session = pool.acquire();
        expect(session).to.exist;
        expect(session).to.not.eql(oldSession);
        pool.release(session);

        done();
      }
    });

    it('should remove sessions which have timed out on release', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const newSession = new ServerSession();
        const oldSessions = [new ServerSession(), new ServerSession()].map(session => {
          session.lastUse = now() - 30 * 60 * 1000; // add 30min
          return session;
        });

        const pool = new ServerSessionPool(test.client);
        done = sessionCleanupHandler(null, pool, done);
        pool.sessions = pool.sessions.concat(oldSessions);

        pool.release(newSession);
        expect(pool.sessions).to.have.length(1);
        expect(pool.sessions[0]).to.eql(newSession);
        done();
      }
    });

    it('should not reintroduce a soon-to-expire session to the pool on release', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const session = new ServerSession();
        session.lastUse = now() - 9.5 * 60 * 1000; // add 9.5min

        const pool = new ServerSessionPool(test.client);
        done = sessionCleanupHandler(null, pool, done);

        pool.release(session);
        expect(pool.sessions).to.have.length(0);
        done();
      }
    });

    it('should maintain a LIFO queue of sessions', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const pool = new ServerSessionPool(test.client);
        done = sessionCleanupHandler(null, pool, done);

        const sessionA = new ServerSession();
        const sessionB = new ServerSession();

        pool.release(sessionA);
        pool.release(sessionB);

        const sessionC = pool.acquire();
        const sessionD = pool.acquire();

        expect(sessionC.id).to.eql(sessionB.id);
        expect(sessionD.id).to.eql(sessionA.id);

        pool.release(sessionC);
        pool.release(sessionD);
        done();
      }
    });
  });

  context('error handling', function() {
    let mockServer;

    afterEach(() => mock.cleanup());
    beforeEach(() => {
      return mock.createServer().then(server => (mockServer = server));
    });

    it('should not mark session as dirty on network error if already ended', function(done) {
      mockServer.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            Object.assign({}, mock.DEFAULT_ISMASTER, { logicalSessionTimeoutMinutes: 10 })
          );
        } else if (doc.ping) {
          request.reply({ ok: 1 });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        } else if (doc.insert) {
          request.connection.destroy();
        }
      });

      const client = this.configuration.newClient(`mongodb://${mockServer.uri()}/test`, {
        useUnifiedTopology: true
      });

      client.connect(err => {
        expect(err).to.not.exist;
        this.defer(() => client.close());

        const session = client.startSession();
        const collection = client.db('test').collection('foo');

        client.db('admin').command({ ping: 1 }, { session }, err => {
          expect(err).to.not.exist;

          process.nextTick(() => session.endSession());
          collection.insertOne({ a: 42 }, { session }, err => {
            expect(err).to.exist;
            done();
          });
        });
      });
    });
  });
});
