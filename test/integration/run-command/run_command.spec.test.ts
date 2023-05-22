import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('RunCommand spec', () => {
  runUnifiedSuite(loadSpecTests('run-command'), test => {
    if (test.description === 'does not attach $readPreference to given command on standalone') {
      return 'TODO(NODE-5263): Do not send $readPreference to standalone servers';
    }
    return false;
  });
});
