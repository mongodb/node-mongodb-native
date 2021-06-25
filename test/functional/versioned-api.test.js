'use strict';

const expect = require('chai').expect;
const loadSpecTests = require('../spec/index').loadSpecTests;
const runUnifiedTest = require('./unified-spec-runner/runner').runUnifiedTest;

describe('Versioned API', function() {
  it('should throw an error if serverApi version is provided via the uri with new parser', {
    metadata: { topology: 'single' },
    test: function(done) {
      const client = this.configuration.newClient({ serverApi: '1' }, { useNewUrlParser: true });
      client.connect(err => {
        expect(err).to.match(/URI cannot contain `serverApi`, it can only be passed to the client/);
        client.close(done);
      });
    }
  });

  for (const versionedApiTest of loadSpecTests('versioned-api')) {
    expect(versionedApiTest).to.exist;
    context(String(versionedApiTest.description), function() {
      for (const test of versionedApiTest.tests) {
        it(String(test.description), {
          metadata: { sessions: { skipLeakTests: true } },
          test() {
            return runUnifiedTest(this, versionedApiTest, test);
          }
        });
      }
    });
  }
});
