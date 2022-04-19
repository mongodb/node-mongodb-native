import { expect } from 'chai';

import { MongoClient, MongoClientOptions } from '../../../src/mongo_client';
import { getTopology } from '../../../src/utils';

describe('TopologyDescription (integration tests)', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client.close();
  });

  context('options', function () {
    context('localThresholdMS', function () {
      it('should be true', async function () {
        const options: MongoClientOptions = {};
        client = await this.configuration.newClient(options).connect();
        const topologyDescription = getTopology(client).description;
        expect(topologyDescription).to.have.ownProperty('localThresholdMS').to.equal(15);
      });

      it('should be false', async function () {
        const options: MongoClientOptions = {
          localThresholdMS: 30
        };
        client = await this.configuration.newClient(options).connect();
        const topologyDescription = getTopology(client).description;
        expect(topologyDescription).to.have.ownProperty('localThresholdMS').to.equal(30);
      });
    });
  });
});
