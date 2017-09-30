'use strict';

const Server = require('../../..').Server,
  mock = require('../../mock'),
  expect = require('chai').expect,
  ServerSessionPool = require('../../../lib/sessions').ServerSessionPool,
  ServerSession = require('../../../lib/sessions').ServerSession,
  ClientSession = require('../../../lib/sessions').ClientSession,
  genClusterTime = require('./common').genClusterTime;

let test = {};
describe('Sessions', function() {
  describe('ClientSession', function() {
    it('should default to `null` for `clusterTime`', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const client = new Server();
        const session = new ClientSession(client);
        expect(session.clusterTime).to.not.exist;
      }
    });

    it('should set the internal clusterTime to `initialClusterTime` if provided', {
      metadata: { requires: { topology: 'single' } },
      test: function() {
        const clusterTime = genClusterTime(Date.now());
        const client = new Server();
        const session = new ClientSession(client, { initialClusterTime: clusterTime });
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

    it('should create a new session if the pool is empty', {
      metadata: { requires: { topology: 'single' } },
      test: function(done) {
        const pool = new ServerSessionPool(test.client);
        expect(pool.sessions).to.have.length(0);
        const session = pool.dequeue();
        expect(session).to.exist;
        expect(pool.sessions).to.have.length(0);
        done();
      }
    });

    it('should reuse sessions which have not timed out yet on dequeue', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const oldSession = new ServerSession();
        const pool = new ServerSessionPool(test.client);
        pool.sessions.push(oldSession);

        const session = pool.dequeue();
        expect(session).to.exist;
        expect(session).to.eql(oldSession);

        done();
      }
    });

    it('should remove sessions which have timed out on dequeue, and return a fresh session', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const oldSession = new ServerSession();
        oldSession.lastUse = new Date(Date.now() - 30 * 60 * 1000).getTime(); // add 30min

        const pool = new ServerSessionPool(test.client);
        pool.sessions.push(oldSession);

        const session = pool.dequeue();
        expect(session).to.exist;
        expect(session).to.not.eql(oldSession);

        done();
      }
    });

    it('should remove sessions which have timed out on enqueue', {
      metadata: { requires: { topology: 'single' } },

      test: function(done) {
        const newSession = new ServerSession();
        const oldSessions = [new ServerSession(), new ServerSession()].map(session => {
          session.lastUse = new Date(Date.now() - 30 * 60 * 1000).getTime(); // add 30min
          return session;
        });

        const pool = new ServerSessionPool(test.client);
        pool.sessions = pool.sessions.concat(oldSessions);

        pool.enqueue(newSession);
        expect(pool.sessions).to.have.length(1);
        expect(pool.sessions[0]).to.eql(newSession);
        done();
      }
    });
  });
});
