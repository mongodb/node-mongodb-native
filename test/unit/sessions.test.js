'use strict';

const mock = require('../tools/mongodb-mock/index');
const { expect } = require('chai');
const { genClusterTime, sessionCleanupHandler } = require('../tools/common');
const { Topology } = require('../../src/sdam/topology');
const { ServerSessionPool, ServerSession, ClientSession } = require('../../src/sessions');
const { now, isHello } = require('../../src/utils');

let test = {};

describe('Sessions - unit/core', function () {
  describe('ClientSession', function () {
    let session;
    let sessionPool;

    afterEach(done => {
      if (sessionPool) {
        sessionCleanupHandler(session, sessionPool, done)();
      } else {
        done();
      }
    });

    it('should throw errors with invalid parameters', {
      metadata: { requires: { topology: 'single' } },
      test: function () {
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

    it('should throw an error if snapshot and causalConsistency options are both set to true', {
      metadata: { requires: { topology: 'single' } },
      test: function () {
        const client = new Topology('localhost:27017', {});
        sessionPool = client.s.sessionPool;
        expect(
          () => new ClientSession(client, sessionPool, { causalConsistency: true, snapshot: true })
        ).to.throw('Properties "causalConsistency" and "snapshot" are mutually exclusive');
      }
    });

    it('should default to `null` for `clusterTime`', {
      metadata: { requires: { topology: 'single' } },
      test: function () {
        const client = new Topology('localhost:27017', {});
        sessionPool = client.s.sessionPool;
        session = new ClientSession(client, sessionPool);
        expect(session.clusterTime).to.not.exist;
      }
    });

    it('should set the internal clusterTime to `initialClusterTime` if provided', {
      metadata: { requires: { topology: 'single' } },
      test: function () {
        const clusterTime = genClusterTime(Date.now());
        const client = new Topology('localhost:27017');
        sessionPool = client.s.sessionPool;
        session = new ClientSession(client, sessionPool, { initialClusterTime: clusterTime });
        expect(session.clusterTime).to.eql(clusterTime);
      }
    });

    describe('startTransaction()', () => {
      it('should throw an error if the session is snapshot enabled', {
        metadata: { requires: { topology: 'single' } },
        test: function () {
          const client = new Topology('localhost:27017', {});
          sessionPool = client.s.sessionPool;
          session = new ClientSession(client, sessionPool, { snapshot: true });
          expect(session.snapshotEnabled).to.equal(true);
          expect(() => session.startTransaction()).to.throw(
            'Transactions are not allowed with snapshot sessions'
          );
        }
      });
    });

    describe('advanceClusterTime()', () => {
      beforeEach(() => {
        const client = new Topology('localhost:27017', {});
        sessionPool = client.s.sessionPool;
        session = new ClientSession(client, sessionPool, {});
      });

      it('should throw an error if the input cluster time is not an object', {
        metadata: { requires: { topology: 'single' } },
        test: function () {
          const invalidInputs = [undefined, null, 3, 'a'];
          for (const input of invalidInputs) {
            expect(() => session.advanceClusterTime(input)).to.throw(
              'input cluster time must be an object'
            );
          }
        }
      });

      it(
        'should throw an error if the input cluster time is missing a valid clusterTime property',
        {
          metadata: { requires: { topology: 'single' } },
          test: function () {
            const invalidInputs = Array(5)
              .fill(1)
              .map(time => genClusterTime(time));

            delete invalidInputs[0].clusterTime;
            invalidInputs[1].clusterTime = null;
            invalidInputs[2].clusterTime = 5;
            invalidInputs[3].clusterTime = 'not a timestamp';
            invalidInputs[4].clusterTime = new Date('1');

            for (const input of invalidInputs) {
              expect(
                () => session.advanceClusterTime(input),
                `expected to fail on input: ${JSON.stringify(input)}`
              ).to.throw(
                'input cluster time "clusterTime" property must be a valid BSON Timestamp'
              );
            }
          }
        }
      );

      it('should throw an error if the input cluster time is missing a valid signature property', {
        metadata: { requires: { topology: 'single' } },
        test: function () {
          const invalidInputs = Array(9)
            .fill(1)
            .map(time => genClusterTime(time));

          // null types
          delete invalidInputs[0].signature;
          delete invalidInputs[1].signature.hash;
          delete invalidInputs[2].signature.keyId;
          invalidInputs[3].signature.hash = null;
          invalidInputs[4].signature.keyId = null;
          // invalid non-null types
          // keyId must be number or BSON long
          // hash must be BSON binary
          invalidInputs[5].signature.keyId = {};
          invalidInputs[6].signature.keyId = 'not BSON Long';
          invalidInputs[7].signature.hash = 123;
          invalidInputs[8].signature.hash = 'not BSON Binary';

          for (const input of invalidInputs) {
            expect(
              () => session.advanceClusterTime(input),
              `expected to fail on input: ${JSON.stringify(input)}`
            ).to.throw(
              'input cluster time must have a valid "signature" property with BSON Binary hash and BSON Long keyId'
            );
          }
        }
      });

      it('should set the session clusterTime to the one provided if the existing session clusterTime is null', () => {
        expect(session).property('clusterTime').to.be.undefined;
        const validTime = genClusterTime(100);
        session.advanceClusterTime(validTime);
        expect(session).property('clusterTime').to.equal(validTime);

        session.clusterTime = null;
        expect(session).property('clusterTime').to.be.null;
        session.advanceClusterTime(validTime);
        expect(session).property('clusterTime').to.equal(validTime);

        // extra test case for valid alternative keyId type in signature
        const alsoValidTime = genClusterTime(200);
        alsoValidTime.signature.keyId = 10;
        session.clusterTime = null;
        expect(session).property('clusterTime').to.be.null;
        session.advanceClusterTime(alsoValidTime);
        expect(session).property('clusterTime').to.equal(alsoValidTime);
      });

      it('should set the session clusterTime to the one provided if it is greater than the the existing session clusterTime', () => {
        const validInitialTime = genClusterTime(100);
        const validGreaterTime = genClusterTime(200);

        session.advanceClusterTime(validInitialTime);
        expect(session).property('clusterTime').to.equal(validInitialTime);

        session.advanceClusterTime(validGreaterTime);
        expect(session).property('clusterTime').to.equal(validGreaterTime);
      });

      it('should leave the session clusterTime unchanged if it is less than or equal to the the existing session clusterTime', () => {
        const validInitialTime = genClusterTime(100);
        const validEqualTime = genClusterTime(100);
        const validLesserTime = genClusterTime(50);

        session.advanceClusterTime(validInitialTime);
        expect(session).property('clusterTime').to.equal(validInitialTime);

        session.advanceClusterTime(validEqualTime);
        expect(session).property('clusterTime').to.equal(validInitialTime); // the reference check ensures no update happened

        session.advanceClusterTime(validLesserTime);
        expect(session).property('clusterTime').to.equal(validInitialTime);
      });
    });
  });

  describe('ServerSessionPool', function () {
    afterEach(() => {
      test.client.close();
      return mock.cleanup();
    });

    beforeEach(() => {
      return mock
        .createServer()
        .then(server => {
          test.server = server;
          test.server.setMessageHandler(request => {
            var doc = request.document;
            if (isHello(doc)) {
              request.reply(Object.assign({}, mock.HELLO, { logicalSessionTimeoutMinutes: 10 }));
            }
          });
        })
        .then(() => {
          test.client = new Topology(test.server.hostAddress());

          return new Promise((resolve, reject) => {
            test.client.once('error', reject);
            test.client.once('connect', resolve);
            test.client.connect();
          });
        });
    });

    it('should throw errors with invalid parameters', {
      metadata: { requires: { topology: 'single' } },
      test: function () {
        expect(() => {
          new ServerSessionPool();
        }).to.throw(/ServerSessionPool requires a topology/);
      }
    });

    it('should create a new session if the pool is empty', {
      metadata: { requires: { topology: 'single' } },
      test: function (done) {
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

      test: function (done) {
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

      test: function (done) {
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

      test: function (done) {
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

      test: function (done) {
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
      test: function (done) {
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
});
