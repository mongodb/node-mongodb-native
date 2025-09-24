import { loadSpecTests } from '../../spec';
import { runUnifiedSuite } from '../../tools/unified-spec-runner/runner';

// The Node driver does not have a Collection.modifyCollection helper.
const SKIPPED_TESTS = [
  'modifyCollection to changeStreamPreAndPostImages enabled',
  'modifyCollection prepareUnique violations are accessible'
];

describe('Collection management unified spec tests', function () {
  runUnifiedSuite(loadSpecTests('collection-management'), ({ description }) =>
    SKIPPED_TESTS.includes(description) ? `the Node driver does not have a collMod helper.` : false
  );
});
