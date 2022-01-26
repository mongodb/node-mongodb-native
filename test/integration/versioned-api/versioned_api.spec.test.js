'use strict';

const { loadSpecTests } = require('../../spec/');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

describe('Versioned API', function () {
  runUnifiedSuite(loadSpecTests('versioned-api'));
});
