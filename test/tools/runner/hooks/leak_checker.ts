import { expect } from 'chai';
import * as chalk from 'chalk';
import { Socket } from 'net';

import { MongoClient } from '../../../../src/mongo_client';
import { ServerSessionPool } from '../../../../src/sessions';

const originalAcquire = ServerSessionPool.prototype.acquire;
const originalRelease = ServerSessionPool.prototype.release;

let activeCount = 0;
let acquireCount = 0;
ServerSessionPool.prototype.acquire = function (...args) {
  acquireCount += 1;
  const result = originalAcquire.call(this, ...args);
  activeCount = this.activeSessions?.size ?? 0;
  return result;
};

let releaseCount = 0;
ServerSessionPool.prototype.release = function (...args) {
  releaseCount += 1;
  const result = originalRelease.call(this, ...args);
  activeCount = this.activeSessions?.size ?? 0;
  return result;
};

const sessionLeakCheckBeforeEach: Mocha.Func = async function sessionLeakCheckBeforeEach() {
  if (this.currentTest?.metadata?.sessions?.skipLeakTests) {
    return;
  }

  // Reset beforeEach test
  activeCount = 0;
  acquireCount = 0;
  releaseCount = 0;
};

const sessionLeakCheckAfterEach: Mocha.Func = async function sessionLeakCheckAfterEach() {
  if (this.currentTest?.state === 'failed' || this.currentTest?.metadata?.sessions?.skipLeakTests) {
    return;
  }

  const title = this.currentTest.fullTitle();
  try {
    expect(
      acquireCount,
      `"${title}" failed to release all sessions, ${activeCount} active`
    ).to.equal(releaseCount);
  } catch (error) {
    // @ts-expect-error: internal mocha api
    this.test.error(error);
  }
};

const originalConnect = MongoClient.prototype.connect;
const originalClose = MongoClient.prototype.close;

let connectCount = 0;
let closeCount = 0;

MongoClient.prototype.connect = function (...args) {
  const lastArg = args[args.length - 1];
  const lastArgIsCallback = typeof lastArg === 'function';
  if (lastArgIsCallback) {
    const argsWithoutCallback = args.slice(0, args.length - 1);
    return originalConnect.call(this, ...argsWithoutCallback, (error, client) => {
      if (error == null) {
        connectCount += 1; // only increment on successful connects
      }
      return lastArg(error, client);
    });
  } else {
    return originalConnect.call(this, ...args).then(client => {
      connectCount += 1; // only increment on successful connects
      return client;
    });
  }
};

MongoClient.prototype.close = function (...args) {
  closeCount += 1;
  return originalClose.call(this, ...args);
};

const clientLeakCheckBeforeEach: Mocha.AsyncFunc = async function clientLeakCheckBeforeEach() {
  // Reset beforeEach test
  connectCount = 0;
  closeCount = 0;
};

const clientLeakCheckAfterEach: Mocha.AsyncFunc = async function clientLeakCheckAfterEach() {
  try {
    const msg = `connected ${connectCount} times but closed only ${closeCount} times`;
    expect(connectCount, msg).to.be.lessThanOrEqual(closeCount);
  } catch (error) {
    // @ts-expect-error: internal mocha api
    this.test.error(error);
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
    beforeEach: [sessionLeakCheckBeforeEach, clientLeakCheckBeforeEach, socketLeakCheckAfterEach],
    afterEach: [sessionLeakCheckAfterEach, clientLeakCheckAfterEach]
  }
};
