'use strict';
const { expect } = require('chai');
const { makeClientMetadata, Topology } = require('../../mongodb');

describe('Topology', function () {
  it('should correctly track states of a topology', {
    metadata: { requires: { apiVersion: false, topology: '!load-balanced' } }, // apiVersion not supported by newTopology()
    test: async function () {
      const topology = new Topology({}, this.configuration.options.hosts, {
        ...this.configuration.options,
        metadata: makeClientMetadata({ driverInfo: {} })
      });

      const states = [];
      topology.on('stateChanged', (_, newState) => {
        states.push(newState);
      });

      await new Promise((resolve, reject) => {
        topology.connect(err => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      await new Promise((resolve, reject) => {
        topology.close({}, err => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      expect(topology.isDestroyed()).to.be.true;
      expect(states).to.eql(['connecting', 'connected', 'closing', 'closed']);
    }
  });
});
