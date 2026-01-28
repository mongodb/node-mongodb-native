import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Command Logging and Monitoring Spec', function () {
  describe('Command Monitoring Spec (unified)', () => {
    runUnifiedSuite(
      loadSpecTests(path.join('command-logging-and-monitoring', 'monitoring')),
      ({ description }) => {
        // This is skipped because our command monitoring happens at the connection
        // level and is using the server reply for the single insert that the bulk
        // performed since it was only one document in the test. The test expectation
        // is that we are using the bulk write result which was returned to the user
        // as the reply in the command succeeded event instead of our raw reply from
        // the server. There's nothing we can change here.
        return description.includes(
          'A successful unordered bulk write with an unacknowledged write concern'
        )
          ? `Test not applicable to Node.`
          : false;
      }
    );
  });

  describe.only('Command Logging Spec', () => {
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
