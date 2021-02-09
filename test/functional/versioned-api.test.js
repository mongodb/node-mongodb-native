'use strict';

const { expect } = require('chai');
const { loadSpecTests } = require('../spec/index');
const { runUnifiedTest } = require('./unified-spec-runner/runner');

describe('Versioned API', function () {
  for (const versionedApiTest of loadSpecTests('versioned-api')) {
    expect(versionedApiTest).to.exist;
    context(String(versionedApiTest.description), function () {
      for (const test of versionedApiTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            try {
              await runUnifiedTest(this, versionedApiTest, test);
            } catch (error) {
              if (error.message.includes('not implemented.')) {
                console.log(`${test.description}: was skipped due to missing functionality`);
                console.log(error.stack);
                this.skip();
              } else {
                throw error;
              }
            }
          }
        });
      }
    });
  }
});
