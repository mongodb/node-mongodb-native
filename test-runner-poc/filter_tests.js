'use strict';
const expect = require('chai').expect;
describe('Filter', function() {
  it('should skip because version is too high', {
    metadata: { requires: { mongodb: '>=4.6.0' } },
    test: function() {
      expect(1).to.equal(1);
    }
  });
  it('should run because version is low', {
    metadata: { requires: { mongodb: '>=3.6.0' } },
    test: function() {
      expect(1).to.equal(1);
    }
  });
  it('should only run when topology is single', {
    metadata: { requires: { topology: 'single' } },
    test: function() {
      expect(1).to.equal(1);
    }
  });
  it('should only run when topology is replicaset', {
    metadata: { requires: { topology: 'replicaset' } },
    test: function() {
      expect(1).to.equal(1);
    }
  });
  it('should only run when topology is sharded', {
    metadata: { requires: { topology: 'sharded' } },
    test: function() {
      expect(1).to.equal(1);
    }
  });
  it('should run when topology is single, replicaset OR sharded', {
    metadata: { requires: { topology: ['single', 'replicaset', 'sharded'] } },
    test: function() {
      expect(1).to.equal(1);
    }
  });
});
