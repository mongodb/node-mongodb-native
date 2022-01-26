'use strict';

const { loadSpecTests } = require('../../spec/index');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

describe('Collection management unified spec tests', function () {
  runUnifiedSuite(loadSpecTests('collection-management'));
});
