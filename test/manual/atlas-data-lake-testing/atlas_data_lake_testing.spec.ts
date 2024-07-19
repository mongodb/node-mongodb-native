import path = require('path');

import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

describe('Atlas Data Lake Unified Tests', function () {
  runUnifiedSuite(loadSpecTests(path.join('atlas-data-lake-testing', 'unified')));
});
