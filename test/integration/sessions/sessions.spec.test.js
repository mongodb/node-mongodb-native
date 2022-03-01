'use strict';

const { join } = require('path');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');
const { loadSpecTests } = require('../../spec');

describe('Sessions spec tests', function () {
  runUnifiedSuite(loadSpecTests(join('sessions', 'tests')), [
    'Dirty explicit session is discarded (insert)',
    'Dirty explicit session is discarded (findAndModify)'
  ]);
});
