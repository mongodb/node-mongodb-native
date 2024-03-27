import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Command Logging and Monitoring Spec', function () {
  describe('Command Monitoring Spec (unified)', () => {
    runUnifiedSuite(loadSpecTests(path.join('command-logging-and-monitoring', 'monitoring')));
  });

  describe('Command Logging Spec', () => {
    const tests = loadSpecTests(path.join('command-logging-and-monitoring', 'logging'));
    runUnifiedSuite(tests, test => {
      if (
        [
          'Successful bulk write command log messages include operationIds',
          'Failed bulk write command log message includes operationId'
        ].includes(test.description)
      ) {
        return 'not applicable: operationId not supported';
      }
      return false;
    });
  });
});
