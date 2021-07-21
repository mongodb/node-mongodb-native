'use strict';

const expect = require('chai').expect;
const executeLegacyOperation = require('../../src/utils').executeLegacyOperation;

describe('executeLegacyOperation', function () {
  it('should call callback with errors on throw errors, and rethrow error', function () {
    const expectedError = new Error('THIS IS AN ERROR');
    let callbackError, caughtError;

    const topology = {
      logicalSessionTimeoutMinutes: null
    };
    const operation = () => {
      throw expectedError;
    };

    const callback = err => (callbackError = err);
    const options = { skipSessions: true };

    try {
      executeLegacyOperation(topology, operation, [{}, callback], options);
    } catch (e) {
      caughtError = e;
    }

    expect(callbackError).to.equal(expectedError);
    expect(caughtError).to.equal(expectedError);
  });

  it('should reject promise with errors on throw errors, and rethrow error', function () {
    const expectedError = new Error('THIS IS AN ERROR');

    const topology = {
      logicalSessionTimeoutMinutes: null
    };
    const operation = () => {
      throw expectedError;
    };

    const options = { skipSessions: true };

    return executeLegacyOperation(topology, operation, [{}, null], options).then(null, err => {
      expect(err).to.equal(expectedError);
    });
  });
});
