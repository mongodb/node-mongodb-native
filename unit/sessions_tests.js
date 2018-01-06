'use strict';

const Server = require('../../..').Server,
  mock = require('mongodb-mock-server'),
  expect = require('chai').expect,
  ServerSessionPool = require('../../../lib/sessions').ServerSessionPool,
  ServerSession = require('../../../lib/sessions').ServerSession,
  ClientSession = require('../../../lib/sessions').ClientSession,
  genClusterTime = require('./common').genClusterTime;

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
      test: function() {
        const client = new Server();
        const sessionPool = new ServerSessionPool(client);
        const session = new ClientSession(client, sessionPool);
        expect(session.clusterTime).to.not.exist;
      }
    });

    it('should set the internal clusterTime to `initialClusterTime` if provided', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const clusterTime = genClusterTime(Date.now());
        const client = new Server();
        const sessionPool = new ServerSessionPool(client);
        const session = new ClientSession(client, sessionPool, { initialClusterTime: clusterTime });
        expect(session.clusterTime).to.eql(clusterTime);
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
        expect(pool.sessions).to.have.length(0);
        const session = pool.acquire();
        expect(session).to.exist;
        expect(pool.sessions).to.have.length(0);
        done();
      }
    });

    it('should reuse sessions which have not timed out yet on acquire', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const oldSession = new ServerSession();
        const pool = new ServerSessionPool(test.client);
        pool.sessions.push(oldSession);

        const session = pool.acquire();
        expect(session).to.exist;
        expect(session).to.eql(oldSession);

        done();
      }
    });

    it('should remove sessions which have timed out on acquire, and return a fresh session', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const oldSession = new ServerSession();
        oldSession.lastUse = new Date(Date.now() - 30 * 60 * 1000).getTime(); // add 30min

        const pool = new ServerSessionPool(test.client);
        pool.sessions.push(oldSession);

        const session = pool.acquire();
        expect(session).to.exist;
        expect(session).to.not.eql(oldSession);

        done();
      }
    });

    it('should remove sessions which have timed out on release', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const newSession = new ServerSession();
        const oldSessions = [new ServerSession(), new ServerSession()].map(session => {
          session.lastUse = new Date(Date.now() - 30 * 60 * 1000).getTime(); // add 30min
          return session;
        });

        const pool = new ServerSessionPool(test.client);
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
        session.lastUse = new Date(Date.now() - 9.5 * 60 * 1000).getTime(); // add 9.5min

        const pool = new ServerSessionPool(test.client);
        pool.release(session);
        expect(pool.sessions).to.have.length(0);
        done();
      }
    });

    it('should maintain a LIFO queue of sessions', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const pool = new ServerSessionPool(test.client);

        const sessionA = new ServerSession();
        const sessionB = new ServerSession();

        pool.release(sessionA);
        pool.release(sessionB);

        const sessionC = pool.acquire();
        const sessionD = pool.acquire();

        expect(sessionC.id).to.eql(sessionB.id);
        expect(sessionD.id).to.eql(sessionA.id);
        done();
      }
    });
  });
});
