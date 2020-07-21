'use strict';
const Timeout = require('../../../../src/core/topologies/shared').Timeout;
const expect = require('chai').expect;

describe('', function () {
  it('should detect when a timer is finished running', function (done) {
    let timeout;
    function timeoutHandler() {
      expect(timeout.isRunning()).to.be.false;
      done();
    }

    timeout = new Timeout(timeoutHandler, 100);
    timeout.start();
  });
});
