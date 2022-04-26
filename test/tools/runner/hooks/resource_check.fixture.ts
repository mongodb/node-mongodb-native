import { expect } from 'chai';
import * as chalk from 'chalk';
///// Test the memory leak checker with the following:
import * as sinon from 'sinon';

import * as BSON from '../../../../src/bson';

const serializeSpy = sinon.spy(BSON, 'serialize');

let startingMemoryUsage: NodeJS.MemoryUsage;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Process {
      _getActiveHandles(): ReadonlyArray<{
        fd?: number;
        _peername?: {
          address: string;
          family: string;
          port: number;
        };
      }>;
      _getActiveRequests(): unknown[];
    }
  }
}

const getActiveHandles = () => {
  const handles = process._getActiveHandles();
  const results = { files: [], sockets: [] };
  for (const { fd, _peername: peer } of handles) {
    if (typeof fd === 'number') {
      results.files.push(fd);
    } else {
      results.sockets.push(peer);
    }
  }
  return results;
};

const toMBString = (byteCount: number) => `${(byteCount / 1000 ** 2).toFixed(3)} MB`;

function mochaGlobalSetup() {
  const activeHandles = getActiveHandles();
  const activeRequests = process._getActiveRequests();

  expect(activeHandles.files).to.have.lengthOf.lessThanOrEqual(3); // stdin/out/err
  expect(activeHandles.sockets).to.have.lengthOf(0);
  expect(activeRequests).to.have.a.lengthOf(0);

  startingMemoryUsage = process.memoryUsage();
}

function mochaGlobalTeardown() {
  const shutdownMemoryUsage = process.memoryUsage();
  const activeHandles = getActiveHandles();
  const activeRequests = process._getActiveRequests();

  const startupHeapUsed = startingMemoryUsage.heapUsed;
  const shutdownHeapUsed = shutdownMemoryUsage.heapUsed;
  const memoryMessage = [
    `  startup heapUsed:  ${toMBString(startupHeapUsed)}`,
    `  shutdown heapUsed: ${toMBString(shutdownHeapUsed)}`
  ].join('\n');
  console.log(`${chalk.yellow(memoryMessage)}\n`);

  if (process.platform === 'darwin' || process.env.ATLAS_DATA_LAKE === 'true') {
    // TODO(NODE-XXXX): on macos we don't check for leaks currently
    // TODO(NODE-XXXX): ADL tests have a remaining connection at the end of the test run but it does not cause the process to hang
    return;
  }

  try {
    expect(activeHandles.files).to.have.lengthOf.lessThanOrEqual(3); // stdin/out/err
    expect(activeHandles.sockets).to.have.lengthOf(0);
    expect(activeRequests).to.have.a.lengthOf(0);
    // Very generous check to quadruple memory usage by the end of testing
    // should catch wildly unbounded allocations only
    // (technically the garbage collector may never be run, but this was observed to be the least flakey)
    expect(
      shutdownHeapUsed,
      `${toMBString(shutdownHeapUsed)} is more than 4x ${toMBString(startupHeapUsed)}`
    ).to.be.lessThan(startupHeapUsed * 4);
  } catch (error) {
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }

  setTimeout(() => {
    console.error(
      'Nodejs is still open after 30 seconds of completing the test run there must be a resource leak'
    );
    process.exit(1);
  }, 30_000).unref();
}

module.exports = { mochaGlobalTeardown, mochaGlobalSetup };
