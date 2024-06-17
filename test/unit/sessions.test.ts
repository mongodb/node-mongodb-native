import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  applySession,
  BSON,
  ClientSession,
  isHello,
  Long,
  MongoClient,
  MongoRuntimeError,
  now,
  ServerSession,
  ServerSessionPool
} from '../mongodb';
import { genClusterTime } from '../tools/common';
import * as mock from '../tools/mongodb-mock/index';
import { getSymbolFrom } from '../tools/utils';

describe('Sessions - unit', function () {
  let client;
  let serverSessionPool;
  let session;

  beforeEach(async function () {
    client = new MongoClient('mongodb://iLoveJavascript');
    serverSessionPool = client.s.sessionPool;
    session = client.startSession();
  });

  describe('class ClientSession', function () {
    describe('startTransaction()', () => {
      it('should throw an error if the session is snapshot enabled', function () {
        session = new ClientSession(client, serverSessionPool, { snapshot: true });
        expect(session.snapshotEnabled).to.equal(true);
        expect(() => session.startTransaction()).to.throw(
          'Transactions are not supported in snapshot sessions'
        );
      });
    });

    describe('advanceClusterTime()', () => {
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

      it('sets clusterTime to the one provided when the signature.keyId is a bigint', () => {
        const validClusterTime = {
          clusterTime: new BSON.Timestamp(BSON.Long.fromNumber(1, true)),
          signature: { hash: new BSON.Binary(Buffer.from('test', 'utf8')), keyId: 100n }
        };

        session.advanceClusterTime(validClusterTime);
        expect(session.clusterTime.signature.keyId).to.equal(100n);
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
        expect(
          () =>
            new ClientSession(client, serverSessionPool, {
              causalConsistency: true,
              snapshot: true
            })
        ).to.throw('Properties "causalConsistency" and "snapshot" are mutually exclusive');
      });

      it('should default `causalConsistency` to `true` for explicit non-snapshot sessions', function () {
        const session = new ClientSession(client, serverSessionPool, { explicit: true });
        expect(session.supports).property('causalConsistency', true);
      });

      it('should default `causalConsistency` to `false` for explicit snapshot sessions', function () {
        const session = new ClientSession(client, serverSessionPool, {
          explicit: true,
          snapshot: true
        });
        expect(session.supports).property('causalConsistency', false);
      });

      it('should allow `causalConsistency=false` option in explicit snapshot sessions', function () {
        const session = new ClientSession(client, serverSessionPool, {
          explicit: true,
          causalConsistency: false,
          snapshot: true
        });
        expect(session.supports).property('causalConsistency', false);
      });

      it('should respect `causalConsistency=false` option in explicit sessions', function () {
        const session = new ClientSession(client, serverSessionPool, {
          explicit: true,
          causalConsistency: false
        });
        expect(session.supports).property('causalConsistency', false);
      });

      it('should respect `causalConsistency=true` option in explicit non-snapshot sessions', function () {
        const session = new ClientSession(client, serverSessionPool, {
          explicit: true,
          causalConsistency: true
        });
        expect(session.supports).property('causalConsistency', true);
      });

      it('should default `causalConsistency` to `false` for implicit sessions', function () {
        const session = new ClientSession(client, serverSessionPool, { explicit: false });
        expect(session.supports).property('causalConsistency', false);
      });

      it('should respect `causalConsistency=false` option in implicit sessions', function () {
        const session = new ClientSession(client, serverSessionPool, {
          explicit: false,
          causalConsistency: false
        });
        expect(session.supports).property('causalConsistency', false);
      });

      it('should respect `causalConsistency=true` option in implicit sessions', function () {
        const session = new ClientSession(client, serverSessionPool, {
          explicit: false,
          causalConsistency: true
        });
        expect(session.supports).property('causalConsistency', true);
      });

      it('should default to `null` for `clusterTime`', function () {
        const session = new ClientSession(client, serverSessionPool);
        expect(session.clusterTime).to.not.exist;
      });

      it('should set the internal clusterTime to `initialClusterTime` if provided', function () {
        const clusterTime = genClusterTime(Date.now());
        const session = new ClientSession(client, serverSessionPool, {
          initialClusterTime: clusterTime
        });
        expect(session.clusterTime).to.eql(clusterTime);
      });

      it('should acquire a serverSession in the constructor if the session is explicit', () => {
        const session = new ClientSession(client, serverSessionPool, { explicit: true });
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');
        expect(session).to.have.property(serverSessionSymbol).that.is.an.instanceOf(ServerSession);
      });

      it('should leave serverSession null if the session is implicit', () => {
        // implicit via false (this should not be allowed...)
        let session = new ClientSession(client, serverSessionPool, { explicit: false });
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');
        expect(session).to.have.property(serverSessionSymbol, null);
        // implicit via omission
        session = new ClientSession(client, serverSessionPool, {});
        expect(session).to.have.property(serverSessionSymbol, null);
      });

      it('should start the txnNumberIncrement at zero', () => {
        const session = new ClientSession(client, serverSessionPool);
        const txnNumberIncrementSymbol = getSymbolFrom(session, 'txnNumberIncrement');
        expect(session).to.have.property(txnNumberIncrementSymbol, 0);
      });

      describe('defaultTimeoutMS', function () {
        let client: MongoClient;
        let session: ClientSession;
        let server;

        beforeEach(async () => {
          server = await mock.createServer();
        });

        afterEach(async () => {
          await mock.cleanup();
        });

        context('when client has defined timeoutMS', function () {
          beforeEach(async () => {
            client = new MongoClient(`mongodb://${server.hostAddress()}`, { timeoutMS: 100 });
          });

          context('when defaultTimeoutMS is defined', function () {
            it(`overrides client's timeoutMS value`, function () {
              session = new ClientSession(client, serverSessionPool, { defaultTimeoutMS: 200 });
              expect(session).to.have.property('timeoutMS', 200);
            });
          });

          context('when defaultTimeoutMS is not defined', function () {
            it(`inherits client's timeoutMS value`, function () {
              session = new ClientSession(client, serverSessionPool, {});
              expect(session).to.have.property('timeoutMS', 100);
            });
          });
        });

        context('when client has not defined timeoutMS', function () {
          beforeEach(async () => {
            client = new MongoClient(`mongodb://${server.hostAddress()}`, {});
          });

          context('when defaultTimeoutMS is defined', function () {
            it(`sets timeoutMS to defaultTimeoutMS`, function () {
              session = new ClientSession(client, serverSessionPool, { defaultTimeoutMS: 200 });
              expect(session).to.have.property('timeoutMS', 200);
            });
          });

          context('when defaultTimeoutMS is not defined', function () {
            it(`leaves timeoutMS as undefined`, function () {
              session = new ClientSession(client, serverSessionPool, {});
              expect(session.timeoutMS).to.be.undefined;
            });
          });
        });
      });
    });

    describe('get serverSession()', () => {
      let serverSessionSymbol;

      before(() => {
        serverSessionSymbol = getSymbolFrom(
          new ClientSession(client, serverSessionPool, {}),
          'serverSession'
        );
      });

      describe('from an explicit session', () => {
        it('should always have a non-null serverSession after construction', () => {
          const session = new ClientSession(client, serverSessionPool, { explicit: true });
          expect(session).to.have.a.property(serverSessionSymbol).be.an.instanceOf(ServerSession);
          expect(session.serverSession).be.an.instanceOf(ServerSession);
        });

        it('should always have non-null serverSession even if it is ended before getter called', () => {
          const session = new ClientSession(client, serverSessionPool, { explicit: true });
          session.hasEnded = true;
          expect(session).to.have.a.property(serverSessionSymbol).be.an.instanceOf(ServerSession);
          expect(session.serverSession).be.an.instanceOf(ServerSession);
        });

        it('should throw if the serverSession at the symbol property goes missing', () => {
          const session = new ClientSession(client, serverSessionPool, { explicit: true });
          // We really want to make sure a ClientSession is not separated from its serverSession
          session[serverSessionSymbol] = null;
          expect(session).to.have.a.property(serverSessionSymbol).be.null;
          expect(() => session.serverSession).throw(MongoRuntimeError);
        });
      });

      describe('from an implicit session', () => {
        it('should throw if the session ended before serverSession was acquired', () => {
          const session = new ClientSession(client, serverSessionPool, { explicit: false }); // make an implicit session
          expect(session).to.have.property(serverSessionSymbol, null);
          session.hasEnded = true;
          expect(() => session.serverSession).to.throw(MongoRuntimeError);
        });

        it('should acquire a serverSession if clientSession.hasEnded is false and serverSession is not set', () => {
          const session = new ClientSession(client, serverSessionPool, { explicit: false }); // make an implicit session
          expect(session).to.have.property(serverSessionSymbol, null);
          session.hasEnded = false;
          const acquireSpy = sinon.spy(serverSessionPool, 'acquire');
          expect(session.serverSession).to.be.instanceOf(ServerSession);
          expect(acquireSpy.calledOnce).to.be.true;
          acquireSpy.restore();
        });

        it('should return the existing serverSession and not acquire a new one if one is already set', () => {
          const session = new ClientSession(client, serverSessionPool, { explicit: false }); // make an implicit session
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
          const session = new ClientSession(client, serverSessionPool, { explicit: false }); // make an implicit session
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
        const session = new ClientSession(client, serverSessionPool);
        const txnNumberIncrementSymbol = getSymbolFrom(session, 'txnNumberIncrement');

        session.incrementTransactionNumber();
        expect(session).to.have.property(txnNumberIncrementSymbol, 1);

        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');
        expect(session).to.have.property(serverSessionSymbol, null);
      });

      it('should save increments to txnNumberIncrement symbol', () => {
        const session = new ClientSession(client, serverSessionPool);
        const txnNumberIncrementSymbol = getSymbolFrom(session, 'txnNumberIncrement');

        session.incrementTransactionNumber();
        session.incrementTransactionNumber();
        session.incrementTransactionNumber();

        expect(session).to.have.property(txnNumberIncrementSymbol, 3);
      });
    });

    describe('applySession()', () => {
      it('should allocate serverSession', () => {
        const session = new ClientSession(client, serverSessionPool);
        const serverSessionSymbol = getSymbolFrom(session, 'serverSession');

        const command = { magic: 1 };
        const result = applySession(session, command, {});

        expect(result).to.not.exist;
        expect(command).to.have.property('lsid');
        expect(session).to.have.property(serverSessionSymbol).that.is.instanceOf(ServerSession);
      });

      it('should apply saved txnNumberIncrements', () => {
        const session = new ClientSession(client, serverSessionPool);
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
    let client;
    let server;

    beforeEach(async () => {
      server = await mock.createServer();
      server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(Object.assign({}, mock.HELLO, { logicalSessionTimeoutMinutes: 10 }));
        }
      });

      client = new MongoClient(`mongodb://${server.hostAddress()}`);
      await client.connect();
    });

    afterEach(async () => {
      if (client) await client.close();
      await mock.cleanup();
    });

    it('should throw errors with invalid parameters', function () {
      expect(() => new ServerSessionPool()).to.throw(MongoRuntimeError);
    });

    it('should create a new session if the pool is empty', function (done) {
      const pool = new ServerSessionPool(client);
      expect(pool.sessions).to.have.length(0);

      const session = pool.acquire();
      expect(session).to.exist;
      expect(pool.sessions).to.have.length(0);
      pool.release(session);

      done();
    });

    it('should reuse sessions which have not timed out yet on acquire', function (done) {
      const oldSession = new ServerSession();
      const pool = new ServerSessionPool(client);
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

      const pool = new ServerSessionPool(client);
      pool.sessions.push(oldSession);

      const session = pool.acquire();
      expect(session).to.exist;
      expect(session).to.not.eql(oldSession);
      pool.release(session);

      done();
    });

    describe('release()', () => {
      const makeOldSession = () => {
        const oldSession = new ServerSession();
        oldSession.lastUse = now() - 30 * 60 * 1000; // add 30min
        return oldSession;
      };

      it('should remove old sessions if they are at the start of the pool', () => {
        const pool = new ServerSessionPool(client);
        // old sessions at the start
        pool.sessions.pushMany(Array.from({ length: 3 }, () => makeOldSession()));
        pool.sessions.pushMany([new ServerSession(), new ServerSession()]);

        pool.release(new ServerSession());

        expect(pool.sessions).to.have.lengthOf(3);
        const anyTimedOutSessions = pool.sessions
          .toArray()
          .some(s => s.hasTimedOut(30 * 60 * 1000));
        expect(anyTimedOutSessions, 'Unexpected timed out sessions found in pool after release').to
          .be.false;
      });

      it('should remove old sessions if they are in the middle of the pool', () => {
        const pool = new ServerSessionPool(client);
        pool.sessions.push(new ServerSession()); // one fresh before
        pool.sessions.pushMany(Array.from({ length: 3 }, () => makeOldSession()));
        pool.sessions.push(new ServerSession()); // one fresh after

        pool.release(new ServerSession());

        expect(pool.sessions).to.have.lengthOf(3);
        const anyTimedOutSessions = pool.sessions
          .toArray()
          .some(s => s.hasTimedOut(30 * 60 * 1000));
        expect(anyTimedOutSessions, 'Unexpected timed out sessions found in pool after release').to
          .be.false;
      });

      it('should remove old sessions if they are at the end of the pool', () => {
        const pool = new ServerSessionPool(client);
        pool.sessions.pushMany([new ServerSession(), new ServerSession()]);

        const oldSession = makeOldSession();
        pool.sessions.push(oldSession);

        pool.release(new ServerSession());

        expect(pool.sessions).to.have.lengthOf(3);
        const anyTimedOutSessions = pool.sessions
          .toArray()
          .some(s => s.hasTimedOut(30 * 60 * 1000));
        expect(anyTimedOutSessions, 'Unexpected timed out sessions found in pool after release').to
          .be.false;
      });

      it('should remove old sessions that are not contiguous in the pool', () => {
        const pool = new ServerSessionPool(client);
        pool.sessions.pushMany([
          makeOldSession(),
          new ServerSession(),
          makeOldSession(),
          new ServerSession(),
          makeOldSession()
        ]);

        pool.release(new ServerSession());

        expect(pool.sessions).to.have.lengthOf(3);
        const anyTimedOutSessions = pool.sessions
          .toArray()
          .some(s => s.hasTimedOut(30 * 60 * 1000));
        expect(anyTimedOutSessions, 'Unexpected timed out sessions found in pool after release').to
          .be.false;
      });
    });

    it('should not reintroduce a soon-to-expire session to the pool on release', function (done) {
      const session = new ServerSession();
      session.lastUse = now() - 9.5 * 60 * 1000; // add 9.5min

      const pool = new ServerSessionPool(client);

      pool.release(session);
      expect(pool.sessions).to.have.length(0);
      done();
    });

    it('should maintain a LIFO queue of sessions', function (done) {
      const pool = new ServerSessionPool(client);

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
