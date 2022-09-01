/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Socket } from 'net';
import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';
import { TestFilter } from '../../tools/unified-spec-runner/schema';
import { sleep } from '../../tools/utils';

const filter: TestFilter = ({ description }) => {
  const isAuthEnabled = process.env.AUTH === 'auth';
  switch (description) {
    case 'Reset server and pool after AuthenticationFailure error':
    case 'Reset server and pool after misc command error':
    case 'Reset server and pool after network error during authentication':
    case 'Reset server and pool after network timeout error during authentication':
    case 'Reset server and pool after shutdown error during authentication':
      // These tests time out waiting for the PoolCleared event
      return isAuthEnabled
        ? 'TODO(NODE-3135): handle auth errors, also see NODE-3891: fix tests broken when AUTH enabled'
        : false;
    case 'Network error on Monitor check':
    case 'Network timeout on Monitor check':
      return 'TODO(NODE-4608): Disallow parallel monitor checks';
    default:
      return false;
  }
};

describe('SDAM Unified Tests', function () {
  afterEach(async function () {
    if (this.currentTest!.pending) {
      return;
    }
    // TODO(NODE-4573): fix socket leaks
    const LEAKY_TESTS = [
      'Command error on Monitor handshake',
      'Network error on Monitor check',
      'Network timeout on Monitor check',
      'Network error on Monitor handshake',
      'Network timeout on Monitor handshake'
    ];

    await sleep(250);
    const sockArray = (process as any)._getActiveHandles().filter(handle => {
      // Stdio are instanceof Socket so look for fd to be null
      return handle.fd == null && handle instanceof Socket && handle.destroyed !== true;
    });
    if (!sockArray.length) {
      return;
    }
    for (const sock of sockArray) {
      sock.destroy();
    }
    if (!LEAKY_TESTS.some(test => test === this.currentTest!.title)) {
      this.test!.error(new Error(`Test failed to clean up ${sockArray.length} socket(s)`));
    }
  });
  runUnifiedSuite(loadSpecTests(path.join('server-discovery-and-monitoring', 'unified')), filter);
});
