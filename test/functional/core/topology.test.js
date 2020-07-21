'use strict';
const expect = require('chai').expect;

describe('Topology', function () {
  it('should correctly track states of a topology', function (done) {
    const topology = this.configuration.newTopology();

    const states = [];
    topology.on('stateChanged', (_, newState) => states.push(newState));
    topology.connect(err => {
      expect(err).to.not.exist;
      topology.destroy(err => {
        expect(err).to.not.exist;
        expect(states).to.eql(['connecting', 'connected', 'closing', 'closed']);
        done();
      });
    });
  });
});
