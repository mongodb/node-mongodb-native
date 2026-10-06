import * as process from 'process';

import { OpCompressedRequest, OpMsgRequest, uncompressibleCommands } from '../../../mongodb';

/**
 * Verifies that the driver never compresses a command that the compression spec forbids
 * compressing (`hello`, legacy hello, authentication commands, etc.).
 *
 * See https://github.com/mongodb/specifications/blob/master/source/compression/OP_COMPRESSED.md#messages-not-allowed-to-be-compressed
 *
 * The check only has something to inspect when the suite runs with a compressor configured (the
 * `COMPRESSOR` environment variable, set by the compression tasks in CI). A regular server accepts
 * compressed `hello` commands, so without this check a violation goes unnoticed.
 *
 * The wrapper is installed once for the whole run rather than per test, because monitors and RTT
 * pingers keep sending `hello` in the background between tests. For the same reason, a violation
 * is reported against the test it was *seen during*, which is not necessarily the test that caused
 * it. Violations are recorded instead of thrown: an error thrown inside the driver on a monitoring
 * connection is just a failed heartbeat, which would not fail any test.
 */

type Violation = { commandName: string; seenDuring: string };

const violations: Violation[] = [];
let compressedMessageCount = 0;
let currentTestTitle = '<outside of a test>';

const originalToBin = OpCompressedRequest.prototype.toBin;
OpCompressedRequest.prototype.toBin = function (...args) {
  compressedMessageCount += 1;

  const message = this['command'];
  const document = message instanceof OpMsgRequest ? message.command : message.query;
  const commandName = Object.keys(document)[0];
  if (uncompressibleCommands.has(commandName)) {
    violations.push({ commandName, seenDuring: currentTestTitle });
  }

  return originalToBin.apply(this, args);
};

function takeViolationsError(): Error | undefined {
  if (violations.length === 0) return undefined;
  const details = violations
    .splice(0)
    .map(({ commandName, seenDuring }) => `  - ${commandName} (seen during "${seenDuring}")`)
    .join('\n');
  return new Error(`Commands that must not be compressed were compressed:\n${details}`);
}

const compressionCheckerBeforeEach = function () {
  currentTestTitle = this.currentTest.fullTitle();
};

const compressionCheckerAfterEach = function () {
  const error = takeViolationsError();
  if (error) {
    this.test.error(error);
  }
};

const compressionCheckerAfterAll = function () {
  const error = takeViolationsError();
  if (error) throw error;

  if (process.env.COMPRESSOR && compressedMessageCount === 0) {
    throw new Error(
      `COMPRESSOR=${process.env.COMPRESSOR} is set but no message was compressed during the run, ` +
        'so the uncompressible command check did not inspect anything'
    );
  }
};

export const mochaHooks = {
  beforeEach: [compressionCheckerBeforeEach],
  afterEach: [compressionCheckerAfterEach],
  afterAll: [compressionCheckerAfterAll]
};
