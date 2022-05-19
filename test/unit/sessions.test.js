'use strict';

const mock = require('../tools/mongodb-mock/index');
const { expect } = require('chai');
const { genClusterTime, sessionCleanupHandler } = require('../tools/common');
const { Topology } = require('../../src/sdam/topology');
const {
  ServerSessionPool,
  ServerSession,
  ClientSession,
  applySession
} = require('../../src/sessions');
const { now, isHello } = require('../../src/utils');
const { getSymbolFrom } = require('../tools/utils');
const { Long } = require('../../src/bson');
const { MongoRuntimeError } = require('../../src/error');
const sinon = require('sinon');

let test = {
  topology: null
};

describe('Sessions - unit', function () {
  const topology = {};
  const serverSessionPool = new ServerSessionPool(topology);

  describe('class ClientSession', function () {
    let session;
    let sessionPool;

    afterEach(done => {
      if (sessionPool) {
        sessionCleanupHandler(session, sessionPool, done)();
      } else {
        done();
      }
    });

    describe('startTransaction()', () => {
      it('should throw an error if the session is snapshot enabled', function () {
        const topology = new Topology('localhost:27017', {});
        sessionPool = topology.s.sessionPool;
        session = new ClientSession(topology, sessionPool, { snapshot: true });
        expect(session.snapshotEnabled).to.equal(true);
        expect(() => session.startTransaction()).to.throw(
          'Transactions are not allowed with snapshot sessions'
        );
      });
    });

    describe('advanceClusterTime()', () => {
      beforeEach(() => {
        const topology = new Topology('localhost:27017', {});
        sessionPool = topology.s.sessionPool;
        session = new ClientSession(topology, sessionPool, {});
      });

      it('should throw an error if the input cluster time is not an object', function () {
        const invalidInputs = [undefined, null, 3, 'a'];
        for (const input of invalidInputs) {
          expect(() => session.advanceClusterTime(input)).to.throw(
            'input cluster time must be an object'
          );
        }
      });

      it('should throw an error if the input cluster time is missing a valid clusterTime property', function () {
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
          ).to.throw('input cluster time "clusterTime" property must be a valid BSON Timestamp');
        }
      });

      it('should throw an error if the input cluster time is missing a valid signature property', function () {
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

    describe('new ClientSession()', () => {
      it('should throw errors with invalid parameters', function () {
        expect(() => {
          new ClientSession();
        }).to.throw(/ClientSession requires a MongoClient/);

        expect(() => {
          new ClientSession({});
        }).to.throw(/ClientSession requires a ServerSessionPool/);

        expect(() => {
          new ClientSession({}, {});
        }).to.throw(/ClientSession requires a ServerSessionPool/);
      });

      it('should throw an error if snapshot and causalConsistency options are both set to true', function () {
        const topology = new Topology('localhost:27017', {});
        sessionPool = topology.s.sessionPool;
        expect(
          () =>
            new ClientSession(topology, sessionPool, { causalConsistency: true, snapshot: true })
        ).to.throw('Properties "causalConsistency" and "snapshot" are mutually exclusive');
      });

      it('should default to `null` for `clusterTime`', function () {
        const topology = new Topology('localhost:27017', {});
        sessionPool = topology.s.sessionPool;
        session = new ClientSession(topology, sessionPool);
        expect(session.clusterTime).to.not.exist;
      });

      it('should set the internal clusterTime to `initialClusterTime` if provided', function () {
        const clusterTime = genClusterTime(Date.now());
        const topology = new Topology('localhost:27017');
        sessionPool = topology.s.sessionPool;
        session = new ClientSession(topology, sessionPool, { initialClusterTime: clusterTime });
        expect(session.clusterTime).to.eql(clusterTime);
      });

      it('should acquire a serverSession in the constructor if the session is explicit', () => {
        const session = new ClientSession(topology, serverSessionPool, { explicit: true });
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');
        expect(session).to.have.property(serverSessionSymbol).that.is.an.instanceOf(ServerSession);
      });

      it('should leave serverSession null if the session is implicit', () => {
        // implicit via false (this should not be allowed...)
        let session = new ClientSession(topology, serverSessionPool, { explicit: false });
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');
        expect(session).to.have.property(serverSessionSymbol, null);
        // implicit via omission
        session = new ClientSession(topology, serverSessionPool, {});
        expect(session).to.have.property(serverSessionSymbol, null);
      });

      it('should start the txnNumberIncrement at zero', () => {
        const session = new ClientSession(topology, serverSessionPool);
        const txnNumberIncrementSymbol = getSymbolFrom(session, 'txnNumberIncrement');
        expect(session).to.have.property(txnNumberIncrementSymbol, 0);
      });
    });

    describe('get serverSession()', () => {
      let serverSessionSymbol;
      before(() => {
        serverSessionSymbol = getSymbolFrom(
          new ClientSession({}, serverSessionPool, {}),
          'serverSession'
        );
      });

      describe('from an explicit session', () => {
        it('should always have a non-null serverSession after construction', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: true });
          expect(session).to.have.a.property(serverSessionSymbol).be.an.instanceOf(ServerSession);
          expect(session.serverSession).be.an.instanceOf(ServerSession);
        });

        it('should always have non-null serverSession even if it is ended before getter called', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: true });
          session.hasEnded = true;
          expect(session).to.have.a.property(serverSessionSymbol).be.an.instanceOf(ServerSession);
          expect(session.serverSession).be.an.instanceOf(ServerSession);
        });

        it('should throw if the serverSession at the symbol property goes missing', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: true });
          // We really want to make sure a ClientSession is not separated from its serverSession
          session[serverSessionSymbol] = null;
          expect(session).to.have.a.property(serverSessionSymbol).be.null;
          expect(() => session.serverSession).throw(MongoRuntimeError);
        });
      });

      describe('from an implicit session', () => {
        it('should throw if the session ended before serverSession was acquired', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: false }); // make an implicit session
          expect(session).to.have.property(serverSessionSymbol, null);
          session.hasEnded = true;
          expect(() => session.serverSession).to.throw(MongoRuntimeError);
        });

        it('should acquire a serverSession if clientSession.hasEnded is false and serverSession is not set', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: false }); // make an implicit session
          expect(session).to.have.property(serverSessionSymbol, null);
          session.hasEnded = false;
          const acquireSpy = sinon.spy(serverSessionPool, 'acquire');
          expect(session.serverSession).to.be.instanceOf(ServerSession);
          expect(acquireSpy.calledOnce).to.be.true;
          acquireSpy.restore();
        });

        it('should return the existing serverSession and not acquire a new one if one is already set', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: false }); // make an implicit session
          expect(session).to.have.property(serverSessionSymbol, null);
          const acquireSpy = sinon.spy(serverSessionPool, 'acquire');
          const firstServerSessionGetResult = session.serverSession;
          expect(firstServerSessionGetResult).to.be.instanceOf(ServerSession);
          expect(acquireSpy.calledOnce).to.be.true;

          // call the getter a bunch more times
          expect(session.serverSession).to.be.instanceOf(ServerSession);
          expect(session.serverSession).to.be.instanceOf(ServerSession);
          expect(session.serverSession).to.be.instanceOf(ServerSession);

          expect(session.serverSession.id.id.buffer.toString('hex')).to.equal(
            firstServerSessionGetResult.id.id.buffer.toString('hex')
          );

          // acquire never called again
          expect(acquireSpy.calledOnce).to.be.true;

          acquireSpy.restore();
        });

        it('should return the existing serverSession and not acquire a new one if one is already set and session is ended', () => {
          const session = new ClientSession(topology, serverSessionPool, { explicit: false }); // make an implicit session
          expect(session).to.have.property(serverSessionSymbol, null);
          const acquireSpy = sinon.spy(serverSessionPool, 'acquire');
          const firstServerSessionGetResult = session.serverSession;
          expect(firstServerSessionGetResult).to.be.instanceOf(ServerSession);
          expect(acquireSpy.calledOnce).to.be.true;

          session.hasEnded = true;

          // call the getter a bunch more times
          expect(session.serverSession).to.be.instanceOf(ServerSession);
          expect(session.serverSession).to.be.instanceOf(ServerSession);
          expect(session.serverSession).to.be.instanceOf(ServerSession);

          expect(session.serverSession.id.id.buffer.toString('hex')).to.equal(
            firstServerSessionGetResult.id.id.buffer.toString('hex')
          );

          // acquire never called again
          expect(acquireSpy.calledOnce).to.be.true;

          acquireSpy.restore();
        });
      });
    });

    describe('incrementTransactionNumber()', () => {
      it('should not allocate serverSession', () => {
        const session = new ClientSession(topology, serverSessionPool);
        const txnNumberIncrementSymbol = getSymbolFrom(session, 'txnNumberIncrement');

        session.incrementTransactionNumber();
        expect(session).to.have.property(txnNumberIncrementSymbol, 1);

        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');
        expect(session).to.have.property(serverSessionSymbol, null);
      });

      it('should save increments to txnNumberIncrement symbol', () => {
        const session = new ClientSession(topology, serverSessionPool);
        const txnNumberIncrementSymbol = getSymbolFrom(session, 'txnNumberIncrement');

        session.incrementTransactionNumber();
        session.incrementTransactionNumber();
        session.incrementTransactionNumber();

        expect(session).to.have.property(txnNumberIncrementSymbol, 3);
      });
    });

    describe('applySession()', () => {
      it('should allocate serverSession', () => {
        const session = new ClientSession(topology, serverSessionPool);
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');

        const command = { magic: 1 };
        const result = applySession(session, command, {});

        expect(result).to.not.exist;
        expect(command).to.have.property('lsid');
        expect(session).to.have.property(serverSessionSymbol).that.is.instanceOf(ServerSession);
      });

      it('should apply saved txnNumberIncrements', () => {
        const session = new ClientSession(topology, serverSessionPool);
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');

        session.incrementTransactionNumber();
        session.incrementTransactionNumber();
        session.incrementTransactionNumber();

        const command = { magic: 1 };
        const result = applySession(session, command, {
          // txnNumber will be applied for retryable write command
          willRetryWrite: true
        });

        expect(result).to.not.exist;
        expect(command).to.have.property('lsid');
        expect(command).to.have.property('txnNumber').instanceOf(Long);
        expect(command.txnNumber.toNumber()).to.equal(3);
        expect(session).to.have.property(serverSessionSymbol).that.is.instanceOf(ServerSession);
      });
    });
  });

  describe('class ServerSessionPool', function () {
    afterEach(() => {
      test.topology.close();
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
          test.topology = new Topology(test.server.hostAddress());

          return new Promise((resolve, reject) => {
            test.topology.once('error', reject);
            test.topology.once('connect', resolve);
            test.topology.connect();
          });
        });
    });

    it('should throw errors with invalid parameters', function () {
      expect(() => {
        new ServerSessionPool();
      }).to.throw(/ServerSessionPool requires a topology/);
    });

    it('should create a new session if the pool is empty', function (done) {
      const pool = new ServerSessionPool(test.topology);
      done = sessionCleanupHandler(null, pool, done);
      expect(pool.sessions).to.have.length(0);

      const session = pool.acquire();
      expect(session).to.exist;
      expect(pool.sessions).to.have.length(0);
      pool.release(session);

      done();
    });

    it('should reuse sessions which have not timed out yet on acquire', function (done) {
      const oldSession = new ServerSession();
      const pool = new ServerSessionPool(test.topology);
      done = sessionCleanupHandler(null, pool, done);
      pool.sessions.push(oldSession);

      const session = pool.acquire();
      expect(session).to.exist;
      expect(session).to.eql(oldSession);
      pool.release(session);

      done();
    });

    it('should remove sessions which have timed out on acquire, and return a fresh session', function (done) {
      const oldSession = new ServerSession();
      oldSession.lastUse = now() - 30 * 60 * 1000; // add 30min

      const pool = new ServerSessionPool(test.topology);
      done = sessionCleanupHandler(null, pool, done);
      pool.sessions.push(oldSession);

      const session = pool.acquire();
      expect(session).to.exist;
      expect(session).to.not.eql(oldSession);
      pool.release(session);

      done();
    });

    it('should remove sessions which have timed out on release', function (done) {
      const newSession = new ServerSession();
      const oldSessions = [new ServerSession(), new ServerSession()].map(session => {
        session.lastUse = now() - 30 * 60 * 1000; // add 30min
        return session;
      });

      const pool = new ServerSessionPool(test.topology);
      done = sessionCleanupHandler(null, pool, done);
      pool.sessions = pool.sessions.concat(oldSessions);

      pool.release(newSession);
      expect(pool.sessions).to.have.length(1);
      expect(pool.sessions[0]).to.eql(newSession);
      done();
    });

    it('should not reintroduce a soon-to-expire session to the pool on release', function (done) {
      const session = new ServerSession();
      session.lastUse = now() - 9.5 * 60 * 1000; // add 9.5min

      const pool = new ServerSessionPool(test.topology);
      done = sessionCleanupHandler(null, pool, done);

      pool.release(session);
      expect(pool.sessions).to.have.length(0);
      done();
    });

    it('should maintain a LIFO queue of sessions', function (done) {
      const pool = new ServerSessionPool(test.topology);
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
    });
  });
});
