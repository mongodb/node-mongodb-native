import { expect } from 'chai';

import { MongoClient, type MongoClientOptions, type Topology } from '../../mongodb';

describe('Topology', function () {
  it(
    'should correctly track states of a topology',
    { requires: { apiVersion: false, topology: '!load-balanced' } },
    async function () {
      class WrappedClient extends MongoClient {
        _topology: Topology | undefined = undefined;
        states: string[] = [];
        constructor(uri: string, options?: MongoClientOptions) {
          super(uri, options);
        }
        // @ts-expect-error Needed for testing
        override get topology(): Topology | undefined {
          return this._topology;
        }
        override set topology(top: Topology | undefined) {
          if (!top) return;
          this._topology = top;
          this._topology?.on('stateChanged', (_, newState) => {
            this.states.push(newState);
          });
        }
      }
      const client = new WrappedClient(this.configuration.url());
      await client.connect();
      await client.close();
      expect(client._topology?.isDestroyed()).to.be.true;
      expect(client.states).to.deep.equal(['connecting', 'connected', 'closing', 'closed']);
    }
  );
});
