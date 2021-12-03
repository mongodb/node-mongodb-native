'use strict';

const { expect } = require('chai');
const { loadSpecTests } = require('../../spec/');
const { runUnifiedTest } = require('../../tools/unified-spec-runner/runner');

describe('Versioned API', function () {
  it('should throw an error if serverApi version is provided via the uri', {
    metadata: { topology: 'single' },
    test: function () {
      expect(() => this.configuration.newClient({ serverApi: '1' })).to.throw(
        /URI cannot contain `serverApi`, it can only be passed to the client/
      );
    }
  });

  for (const versionedApiTest of loadSpecTests('versioned-api')) {
    expect(versionedApiTest).to.exist;
    context(String(versionedApiTest.description), function () {
      for (const test of versionedApiTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test: async function () {
            await runUnifiedTest(this, versionedApiTest, test);
          }
        });
      }
    });
  }
});
