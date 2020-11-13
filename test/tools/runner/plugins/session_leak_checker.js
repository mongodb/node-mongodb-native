'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const { Topology } = require('../../../../src/sdam/topology');
const { MongoClient } = require('../../../../src/mongo_client');
const { ServerSessionPool } = require('../../../../src/sessions');

const sandbox = sinon.createSandbox();
let activeSessions, pooledSessions, activeSessionsBeforeClose;
function getSessionLeakMetadata(currentTest) {
  return (currentTest.metadata && currentTest.metadata.sessions) || {};
}

const kTrace = Symbol('trace');
function dumpSessionInfo(which, sessions) {
  console.warn(which);
  sessions.forEach(session => {
    console.warn(` >> ${JSON.stringify(session.id)}`);
    if (session[kTrace]) {
      console.warn(session[kTrace]);
    }
  });
}

beforeEach('Session Leak Before Each - Set up clean test environment', () => {
  sandbox.restore();
  activeSessions = new Set();
  pooledSessions = new Set();
  activeSessionsBeforeClose = new Set();
});

beforeEach('Session Leak Before Each - setup session tracking', function () {
  if (!this.currentTest || getSessionLeakMetadata(this.currentTest).skipLeakTests) {
    return;
  }

  const _startSession = Topology.prototype.startSession;
  sandbox.stub(Topology.prototype, 'startSession').callsFake(function () {
    const session = _startSession.apply(this, arguments);
    const stackTrace = new Error().stack;
    const result = new Proxy(session, {
      get: function (target, prop) {
        if (prop === 'serverSession') {
          const serverSession = target[prop];
          if (serverSession[kTrace] == null) {
            serverSession[kTrace] = stackTrace;
          }

          return serverSession;
        }

        return Reflect.get(...arguments);
      }
    });

    return result;
  });

  const _acquire = ServerSessionPool.prototype.acquire;
  sandbox.stub(ServerSessionPool.prototype, 'acquire').callsFake(function () {
    const session = _acquire.apply(this, arguments);
    activeSessions.add(session);
    return session;
  });

  const _release = ServerSessionPool.prototype.release;
  sandbox.stub(ServerSessionPool.prototype, 'release').callsFake(function (session) {
    activeSessions.delete(session);
    pooledSessions.add(session);

    return _release.apply(this, arguments);
  });

  const _endAllPooledSessions = ServerSessionPool.prototype.endAllPooledSessions;
  sandbox.stub(ServerSessionPool.prototype, 'endAllPooledSessions').callsFake(function () {
    pooledSessions.clear();
    return _endAllPooledSessions.apply(this, arguments);
  });

  [Topology].forEach(topology => {
    const _endSessions = topology.prototype.endSessions;
    sandbox.stub(topology.prototype, 'endSessions').callsFake(function (sessions) {
      sessions = Array.isArray(sessions) ? sessions : [sessions];
      sessions.forEach(session => pooledSessions.delete(session));
      return _endSessions.apply(this, arguments);
    });
  });

  const _close = MongoClient.prototype.close;
  sandbox.stub(MongoClient.prototype, 'close').callsFake(function () {
    activeSessionsBeforeClose = new Set(activeSessions);
    return _close.apply(this, arguments);
  });
});

afterEach('Session Leak After Each - ensure no leaks', function () {
  if (
    this.currentTest == null ||
    this.currentTest.state === 'failed' ||
    getSessionLeakMetadata(this.currentTest).skipLeakTests
  ) {
    return;
  }

  try {
    if (activeSessionsBeforeClose.size) {
      dumpSessionInfo('active sessions before `close`', activeSessionsBeforeClose);
    }

    expect(
      activeSessionsBeforeClose.size,
      `test is leaking ${activeSessionsBeforeClose.size} active sessions while running client`
    ).to.equal(0);

    if (activeSessions.size) {
      dumpSessionInfo('active sessions', activeSessions);
    }

    expect(
      activeSessions.size,
      `client close failed to clean up ${activeSessions.size} active sessions`
    ).to.equal(0);

    if (pooledSessions.size) {
      dumpSessionInfo('pooled sessions', pooledSessions);
    }

    expect(
      pooledSessions.size,
      `client close failed to clean up ${pooledSessions.size} pooled sessions`
    ).to.equal(0);
  } catch (e) {
    activeSessions.clear();
    pooledSessions.clear();
    activeSessionsBeforeClose.clear();
    this.test.error(e);
  }
});
