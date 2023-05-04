'use strict';

import { MongoClientOptions, makeClientMetadata, Topology, MongoClient } from "../../mongodb";
import { expect } from 'chai';
import { promisify } from 'util';
import sinon from "sinon";


class SpiableClient {
  client: MongoClient;
  constructor(client: MongoClient) {
    this.client = client;
  }

  get topology(): Topology | undefined {
    return this.client.topology;
  }
}

describe('Topology', function() {
  it('should correctly track states of a topology', {
    // @ts-ignore-next-line
    metadata: { requires: { apiVersion: false, topology: '!load-balanced' } }, // apiVersion not supported by newTopology()
    test: async function() {
      const options = { ...this.configuration.options, metadata: makeClientMetadata({ driverInfo: {} }) };

      const topology = new Topology(
        {} as any,
        this.configuration.options.hostAddresses,
        options
      );

      const states: any[] = [];
      topology.on('stateChanged', (_, newState) => {
        states.push(newState);
      });

      await promisify(callback => topology.connect(callback))();

      await promisify(callback => topology.close({}, callback))();

      expect(topology.isDestroyed()).to.be.true;
      expect(states).to.eql(['connecting', 'connected', 'closing', 'closed']);
    }
  });
});
