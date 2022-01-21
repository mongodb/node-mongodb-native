'use strict';

const { expect } = require('chai');
const { loadSpecTests } = require('../../spec/');
const { runUnifiedSuite } = require('../../tools/unified-spec-runner/runner');

describe('Versioned API', function () {
  it('should throw an error if serverApi version is provided via the uri', {
    metadata: { topology: 'single' },
    test: function () {
      expect(() => this.configuration.newClient({ serverApi: '1' })).to.throw(
        /URI cannot contain `serverApi`, it can only be passed to the client/
      );
    }
  });

  runUnifiedSuite(loadSpecTests('versioned-api'));
});
