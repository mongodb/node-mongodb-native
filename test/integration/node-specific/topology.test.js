'use strict';
const { expect } = require('chai');

describe('Topology', function () {
  it('should correctly track states of a topology', {
    metadata: { requires: { apiVersion: false, topology: '!load-balanced' } }, // apiVersion not supported by newTopology()
    test: function (done) {
      debugger;
      const topology = this.configuration.newTopology();

      const states = [];
      topology.on('stateChanged', (_, newState) => states.push(newState));
      topology.connect(err => {
        try {
          expect(err).to.not.exist;
        } catch (error) {
          done(error);
        }
        console.log('before close');
        topology.close({}, err => {
          console.log('In close');
          try {
            expect(err).to.not.exist;
            expect(topology.isDestroyed()).to.be.true;
            expect(states).to.eql(['connecting', 'connected', 'closing', 'closed']);
            done();
          } catch (error) {
            done(error);
          }
        });
      });
    }
  });
});
