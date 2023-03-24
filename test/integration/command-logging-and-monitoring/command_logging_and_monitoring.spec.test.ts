import * as path from 'path';

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

// This is skipped because our command monitoring happens at the connection
// level and is using the server reply for the single insert that the bulk
// performed since it was only one document in the test. The test expectation
// is that we are using the bulk write result which was returned to the user
// as the reply in the command succeeded event instead of our raw reply from
// the server. There's nothing we can change here.
const SKIP = ['A successful unordered bulk write with an unacknowledged write concern'];

describe('Command Logging and Monitoring Spec', function () {
  describe('Command Monitoring Spec (unified)', () => {
    runUnifiedSuite(
      loadSpecTests(path.join('command-logging-and-monitoring', 'monitoring')),
      ({ description }) =>
        SKIP.includes(description)
          ? `TODO(NODE-4261): support skip reasons in unified tests`
          : false
    );
  });

  describe.skip('Command Logging Spec', () => {
    runUnifiedSuite(loadSpecTests(path.join('command-logging-and-monitoring', 'logging')));
  }).skipReason = 'TODO(NODE-4686): Unskip these tests';
});
