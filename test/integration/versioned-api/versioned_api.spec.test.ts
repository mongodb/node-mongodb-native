import { loadSpecTests } from '../../spec/';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Versioned API', function () {
  runUnifiedSuite(loadSpecTests('versioned-api'));
});
