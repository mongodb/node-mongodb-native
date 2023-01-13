import { expect } from 'chai';

import { getTopology, MongoClient, MongoClientOptions, TopologyType } from '../../mongodb';

describe('TopologyDescription (integration tests)', function () {
  let client: MongoClient;

  afterEach(async function () {
    await client.close();
  });

  context('options', function () {
    context('localThresholdMS', function () {
      it('should default to 15ms', async function () {
        const options: MongoClientOptions = {};
        client = await this.configuration.newClient(options).connect();
        const topologyDescription = getTopology(client).description;
        expect(topologyDescription).to.have.ownProperty('localThresholdMS').to.equal(15);
      });

      it('should be set to the localThresholdMS option when it is passed in', async function () {
        const options: MongoClientOptions = {
          localThresholdMS: 30
        };
        client = await this.configuration.newClient(options).connect();
        const topologyDescription = getTopology(client).description;
        expect(topologyDescription).to.have.ownProperty('localThresholdMS').to.equal(30);
      });
    });
  });

  context('topology types', function () {
    let client: MongoClient;
    beforeEach(async function () {
      client = this.configuration.newClient();
    });

    afterEach(async function () {
      await client.close();
    });

    const topologyTypesMap = new Map<TopologyTypeRequirement, TopologyType>([
      ['single', TopologyType.Single],
      ['replicaset', TopologyType.ReplicaSetWithPrimary],
      ['sharded', TopologyType.Sharded],
      ['load-balanced', TopologyType.LoadBalanced]
      // Intentionally omitted ReplicaSetNoPrimary & Unknown
    ]);

    for (const [filterType, driverType] of topologyTypesMap) {
      it(
        `when running against ${filterType} driver should declare ${driverType} topology type`,
        { requires: { topology: filterType } },
        async () => {
          await client.db().command({ ping: 1 });
          expect(client.topology).to.exist;
          expect(client.topology.description).to.exist;
          expect(client.topology.description).to.have.property('type', driverType);
        }
      );
    }
  });
});
