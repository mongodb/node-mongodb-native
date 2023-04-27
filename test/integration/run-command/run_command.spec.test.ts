import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('RunCommand spec', () => {
  runUnifiedSuite(loadSpecTests('run-command'));
});
