/* eslint-disable @typescript-eslint/no-this-alias */

import { expect } from 'chai';
import * as chalk from 'chalk';
import * as net from 'net';
import * as process from 'process';

import { MongoClient } from '../../../mongodb';
import { ServerSessionPool } from '../../../mongodb';

class LeakChecker {
  static originalAcquire: typeof ServerSessionPool.prototype.acquire;
  static originalRelease: typeof ServerSessionPool.prototype.release;
  static kAcquiredCount: symbol;

  static originalConnect: typeof MongoClient.prototype.connect;
  static originalClose: typeof MongoClient.prototype.close;
  static kConnectCount: symbol;

  static {
    this.originalAcquire = ServerSessionPool.prototype.acquire;
    this.originalRelease = ServerSessionPool.prototype.release;
    this.kAcquiredCount = Symbol('acquiredCount');
    this.originalConnect = MongoClient.prototype.connect;
    this.originalClose = MongoClient.prototype.close;
    this.kConnectCount = Symbol('connectedCount');
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

      this[LeakChecker.kAcquiredCount] ??= 0;
      this[LeakChecker.kAcquiredCount] += 1;

      return LeakChecker.originalAcquire.call(this, ...args);
    };

    ServerSessionPool.prototype.release = function (...args) {
      if (!(LeakChecker.kAcquiredCount in this)) {
        throw new Error('releasing before acquiring even once??');
      } else {
        this[LeakChecker.kAcquiredCount] -= 1;
      }

      return LeakChecker.originalRelease.call(this, ...args);
    };
  }

  setupClientLeakChecker() {
    const leakChecker = this;
    MongoClient.prototype.connect = function (...args) {
      leakChecker.clients.add(this);
      this[LeakChecker.kConnectCount] ??= 0;

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
      this[LeakChecker.kConnectCount] ??= 0; // prevents NaN, its fine to call close on a client that never called connect
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
    currentLeakChecker?.assert();
  } catch (error) {
    thrownError = error;
  }

  currentLeakChecker?.reset();
  currentLeakChecker = null;

  if (thrownError instanceof Error) {
    this.test.error(thrownError);
  }
};

const TRACE_SOCKETS = process.env.TRACE_SOCKETS === 'true' ? true : false;
const kSocketId = Symbol('socketId');
const originalCreateConnection = net.createConnection;

const socketLeakCheckBeforeEach = function socketLeakCheckBeforeAll() {
  const description = this.currentTest.title;
  let id = 0;
  // @ts-expect-error: Typescript says this is readonly, but it is not at runtime
  net.createConnection = options => {
    const socket = originalCreateConnection(options);
    socket[kSocketId] = `"${description}" (${id++})`;
    return socket;
  };
};

const filterHandlesForSockets = function (handle: any): handle is net.Socket {
  // Stdio are instanceof Socket so look for fd to be null
  return handle?.fd == null && handle instanceof net.Socket && handle?.destroyed !== true;
};

const socketLeakCheckAfterEach: Mocha.AsyncFunc = async function socketLeakCheckAfterEach() {
  const indent = '  '.repeat(this.currentTest.titlePath().length + 1);

  const handles = (process as any)._getActiveHandles();
  const sockets: net.Socket[] = handles.filter(handle => filterHandlesForSockets(handle));

  for (const socket of sockets) {
    console.log(
      chalk.yellow(
        `${indent}⚡︎ socket ${socket[kSocketId]} not destroyed [${socket.localAddress}:${socket.localPort} → ${socket.remoteAddress}:${socket.remotePort}]`
      )
    );
  }
};

const beforeEach = [leakCheckerBeforeEach, ...(TRACE_SOCKETS ? [socketLeakCheckBeforeEach] : [])];
const afterEach = [leakCheckerAfterEach, ...(TRACE_SOCKETS ? [socketLeakCheckAfterEach] : [])];
export const mochaHooks = { beforeEach, afterEach };
