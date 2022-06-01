/* eslint-disable @typescript-eslint/no-this-alias */
import { expect } from 'chai';
import * as chalk from 'chalk';
import { Socket } from 'net';

import { MongoClient } from '../../../../src/mongo_client';
import { ServerSession, ServerSessionPool } from '../../../../src/sessions';

class LeakChecker {
  static originalAcquire: typeof ServerSessionPool.prototype.acquire;
  static originalRelease: typeof ServerSessionPool.prototype.release;
  static kAcquiredCount: symbol;

  static originalConnect: typeof MongoClient.prototype.connect;
  static originalClose: typeof MongoClient.prototype.close;
  static kConnectCount: symbol;

  static {
    LeakChecker.originalAcquire = ServerSessionPool.prototype.acquire;
    LeakChecker.originalRelease = ServerSessionPool.prototype.release;
    LeakChecker.kAcquiredCount = Symbol('acquiredCount');

    LeakChecker.originalConnect = MongoClient.prototype.connect;
    LeakChecker.originalClose = MongoClient.prototype.close;
    LeakChecker.kConnectCount = Symbol('connectedCount');
  }

  clients: Set<MongoClient>;
  sessionPools: Set<ServerSessionPool>;

  constructor(public titlePath: string) {
    this.clients = new Set<MongoClient>();
    this.sessionPools = new Set<ServerSessionPool>();
  }

  setupSessionLeakChecker() {
    const leakChecker = this;
    ServerSessionPool.prototype.acquire = function (...args) {
      leakChecker.sessionPools.add(this);

      if (!(LeakChecker.kAcquiredCount in this)) {
        this[LeakChecker.kAcquiredCount] = 1;
      } else {
        this[LeakChecker.kAcquiredCount] += 1;
      }

      const result = LeakChecker.originalAcquire.call(this, ...args);
      return result;
    };

    ServerSessionPool.prototype.release = function (...args) {
      if (!(LeakChecker.kAcquiredCount in this)) {
        throw new Error('releasing before acquiring even once??');
      } else {
        this[LeakChecker.kAcquiredCount] -= 1;
      }

      const result = LeakChecker.originalRelease.call(this, ...args);
      return result;
    };
  }

  setupClientLeakChecker() {
    const leakChecker = this;
    MongoClient.prototype.connect = function (...args) {
      leakChecker.clients.add(this);
      if (!(LeakChecker.kConnectCount in this)) {
        this[LeakChecker.kConnectCount] = 0;
      }

      const lastArg = args[args.length - 1];
      const lastArgIsCallback = typeof lastArg === 'function';
      if (lastArgIsCallback) {
        const argsWithoutCallback = args.slice(0, args.length - 1);
        return LeakChecker.originalConnect.call(this, ...argsWithoutCallback, (error, client) => {
          if (error == null) {
            this[LeakChecker.kConnectCount] += 1; // only increment on successful connects
          }
          return lastArg(error, client);
        });
      } else {
        return LeakChecker.originalConnect.call(this, ...args).then(client => {
          this[LeakChecker.kConnectCount] += 1; // only increment on successful connects
          return client;
        });
      }
    };

    MongoClient.prototype.close = function (...args) {
      if (!(LeakChecker.kConnectCount in this)) {
        // interesting, was never connected, possible but weird
        this[LeakChecker.kConnectCount] = 0;
      }

      this[LeakChecker.kConnectCount] -= 1;
      return LeakChecker.originalClose.call(this, ...args);
    };
  }

  setup() {
    this.setupSessionLeakChecker();
    this.setupClientLeakChecker();
  }

  reset() {
    for (const sessionPool of this.sessionPools) {
      delete sessionPool[LeakChecker.kAcquiredCount];
    }
    ServerSessionPool.prototype.acquire = LeakChecker.originalAcquire;
    ServerSessionPool.prototype.release = LeakChecker.originalRelease;
    this.sessionPools.clear();

    for (const client of this.clients) {
      delete client[LeakChecker.kConnectCount];
    }
    MongoClient.prototype.connect = LeakChecker.originalConnect;
    MongoClient.prototype.close = LeakChecker.originalClose;
    this.clients.clear();
  }

  assert() {
    for (const pool of this.sessionPools) {
      expect(pool[LeakChecker.kAcquiredCount], 'ServerSessionPool acquired count').to.equal(0);
    }
    for (const client of this.clients) {
      expect(client[LeakChecker.kConnectCount], 'MongoClient connect count').to.be.lessThanOrEqual(
        0
      );
    }
  }
}

let currentLeakChecker: LeakChecker | null;

const leakCheckerBeforeEach = async function () {
  currentLeakChecker = new LeakChecker(this.currentTest.fullTitle());
  currentLeakChecker.setup();
};
const leakCheckerAfterEach = async function () {
  let thrownError: Error | undefined;
  try {
    currentLeakChecker.assert();
  } catch (error) {
    thrownError = error;
  }

  currentLeakChecker?.reset();
  currentLeakChecker = null;

  if (thrownError instanceof Error) {
    this.test.error(thrownError);
    // throw thrownError;
  }
};

const TRACE_SOCKETS = process.env.TRACE_SOCKETS === 'true' ? true : false;
const socketLeakCheckAfterEach: Mocha.AsyncFunc = async function socketLeakCheckAfterEach() {
  if (!TRACE_SOCKETS) return;

  const handles: any[] = (process as any)._getActiveHandles();
  for (const handle of handles) {
    if (handle.fd == null && handle instanceof Socket && handle.destroyed !== true) {
      console.log(
        chalk.yellow(
          `${'  '.repeat(this.currentTest.titlePath().length + 1)}⚡︎ Socket remains open ${
            handle.localAddress
          }:${handle.localPort} -> ${handle.remoteAddress}:${handle.remotePort}`
        )
      );
    }
  }
};

module.exports = {
  mochaHooks: {
    beforeEach: [leakCheckerBeforeEach, socketLeakCheckAfterEach],
    afterEach: [leakCheckerAfterEach]
  }
};
