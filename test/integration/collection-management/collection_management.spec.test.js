'use strict';

const { loadSpecTests } = require('../../spec/index');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

// The Node driver does not have a Collection.modifyCollection helper.
const SKIPPED_TESTS = ['modifyCollection to changeStreamPreAndPostImages enabled'];

describe('Collection management unified spec tests', function () {
  runUnifiedSuite(loadSpecTests('collection-management'), ({ description }) =>
    SKIPPED_TESTS.includes(description) ? `the Node driver does not have a collMod helper.` : false
  );
});
