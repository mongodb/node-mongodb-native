'use strict';
const { loadSpecTests } = require('../../spec');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');
const path = require('path');

const filter = ({ description }) => {
  // return description !== 'Concurrent shutdown error on insert' ? 'skip' : false;

  const isAuthEnabled = process.env.AUTH === 'auth';
  switch (description) {
    case 'Reset server and pool after AuthenticationFailure error':
    case 'Reset server and pool after misc command error':
    case 'Reset server and pool after network error during authentication':
    case 'Reset server and pool after network timeout error during authentication':
    case 'Reset server and pool after shutdown error during authentication':
      // Some tests are failing when setting a failCommand when auth is enabled
      // and time out waiting for the PoolCleared event
      return isAuthEnabled ? 'TODO(NODE-3891): fix tests broken when AUTH enabled' : false;
    case 'Network error on Monitor check':
    case 'Network timeout on Monitor handshake':
    case 'Network timeout on Monitor check':
    case 'Driver extends timeout while streaming':
      return 'TODO(NODE-4573): fix socket leaks';
    default:
      return false;
  }
};

describe('SDAM Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('server-discovery-and-monitoring', 'unified')), filter);
});
