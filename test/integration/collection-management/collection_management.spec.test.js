'use strict';

const { expect } = require('chai');
const { loadSpecTests } = require('../../spec/index');
const { runUnifiedTest } = require('../../tools/unified-spec-runner/runner');

describe('Collection management unified spec tests', function () {
  for (const collectionManagementTest of loadSpecTests('collection-management')) {
    expect(collectionManagementTest).to.exist;
    context(String(collectionManagementTest.description), function () {
      for (const test of collectionManagementTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            await runUnifiedTest(this, collectionManagementTest, test);
          }
        });
      }
    });
  }
});
