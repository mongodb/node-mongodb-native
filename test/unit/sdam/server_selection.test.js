'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const { ObjectId } = require('../../mongodb');
const { ReadPreference } = require('../../mongodb');
const {
  sameServerSelector,
  secondaryWritableServerSelector,
  MIN_SECONDARY_WRITE_WIRE_VERSION
} = require('../../mongodb');
const { ServerDescription } = require('../../mongodb');
const { TopologyDescription } = require('../../mongodb');
const { TopologyType } = require('../../mongodb');

describe('server selection', function () {
  const primary = new ServerDescription('127.0.0.1:27017', {
    setName: 'test',
    isWritablePrimary: true,
    ok: 1
  });
  const secondary = new ServerDescription('127.0.0.1:27018', {
    setName: 'test',
    secondary: true,
    ok: 1
  });
  const mongos = new ServerDescription('127.0.0.1:27019', {
    msg: 'isdbgrid',
    ok: 1
  });
  const loadBalancer = new ServerDescription('127.0.0.1:27020', { ok: 1 }, { loadBalanced: true });
  const single = new ServerDescription('127.0.0.1:27021', {
    isWritablePrimary: true,
    ok: 1
  });
  const unknown = new ServerDescription('127.0.0.1:27022', {
    ok: 0
  });

  describe('#sameServerSelector', function () {
    const topologyDescription = sinon.stub();
    const serverDescriptions = new Map();
    serverDescriptions.set(primary.address, primary);
    serverDescriptions.set(unknown.address, unknown);
    let selector;
    let servers;

    beforeEach(function () {
      servers = selector(topologyDescription, Array.from(serverDescriptions.values()));
    });

    context('when the server is unknown', function () {
      before(function () {
        selector = sameServerSelector(unknown);
      });

      it('returns an empty array', function () {
        expect(servers).to.be.empty;
      });
    });

    context('when the server is not unknown', function () {
      before(function () {
        selector = sameServerSelector(primary);
      });

      it('returns the server', function () {
        expect(servers).to.deep.equal([primary]);
      });
    });

    context('when no server description provided', function () {
      before(function () {
        selector = sameServerSelector();
      });

      it('returns an empty array', function () {
        expect(servers).to.be.empty;
      });
    });

    context('when the server is not the same', function () {
      before(function () {
        selector = sameServerSelector(secondary);
      });

      it('returns an empty array', function () {
        expect(servers).to.be.empty;
      });
    });
  });

  describe('#secondaryWritableServerSelector', function () {
    context('when the topology is a replica set', function () {
      const serverDescriptions = new Map();
      serverDescriptions.set(primary.address, primary);
      serverDescriptions.set(secondary.address, secondary);

      context('when the common server version is >= 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.ReplicaSetWithPrimary,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('uses the provided read preference', function () {
            expect(servers).to.deep.equal([secondary]);
          });
        });

        context('when a read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a primary', function () {
            expect(servers).to.deep.equal([primary]);
          });
        });
      });

      context('when the common server version is < 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.ReplicaSetWithPrimary,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION - 1
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION - 1,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a primary', function () {
            expect(servers).to.deep.equal([primary]);
          });
        });

        context('when read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION - 1);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a primary', function () {
            expect(servers).to.deep.equal([primary]);
          });
        });
      });

      context('when a common wire version is not provided', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.ReplicaSetWithPrimary,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );
        const selector = secondaryWritableServerSelector(undefined, ReadPreference.secondary);
        const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a primary', function () {
          expect(servers).to.deep.equal([primary]);
        });
      });
    });

    context('when the topology is sharded', function () {
      const serverDescriptions = new Map();
      serverDescriptions.set(mongos.address, mongos);

      context('when the common server version is >= 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Sharded,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a mongos', function () {
            expect(servers).to.deep.equal([mongos]);
          });
        });

        context('when a read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a mongos', function () {
            expect(servers).to.deep.equal([mongos]);
          });
        });
      });

      context('when the common server version is < 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Sharded,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION - 1
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION - 1,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a mongos', function () {
            expect(servers).to.deep.equal([mongos]);
          });
        });

        context('when read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION - 1);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a mongos', function () {
            expect(servers).to.deep.equal([mongos]);
          });
        });
      });

      context('when a common wire version is not provided', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Sharded,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );
        const selector = secondaryWritableServerSelector();
        const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a mongos', function () {
          expect(servers).to.deep.equal([mongos]);
        });
      });
    });

    context('when the topology is load balanced', function () {
      const serverDescriptions = new Map();
      serverDescriptions.set(loadBalancer.address, loadBalancer);

      context('when the common server version is >= 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.LoadBalanced,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a load balancer', function () {
            expect(servers).to.deep.equal([loadBalancer]);
          });
        });

        context('when a read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a load balancer', function () {
            expect(servers).to.deep.equal([loadBalancer]);
          });
        });
      });

      context('when the common server version is < 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.LoadBalanced,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION - 1
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION - 1,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a load balancer', function () {
            expect(servers).to.deep.equal([loadBalancer]);
          });
        });

        context('when read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION - 1);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a load balancer', function () {
            expect(servers).to.deep.equal([loadBalancer]);
          });
        });
      });

      context('when a common wire version is not provided', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.LoadBalanced,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );
        const selector = secondaryWritableServerSelector();
        const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a load balancer', function () {
          expect(servers).to.deep.equal([loadBalancer]);
        });
      });
    });

    context('when the topology is single', function () {
      const serverDescriptions = new Map();
      serverDescriptions.set(single.address, single);

      context('when the common server version is >= 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Single,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a standalone', function () {
            expect(servers).to.deep.equal([single]);
          });
        });

        context('when a read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a standalone', function () {
            expect(servers).to.deep.equal([single]);
          });
        });
      });

      context('when the common server version is < 5.0', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Single,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION - 1
        );

        context('when a read preference is provided', function () {
          const selector = secondaryWritableServerSelector(
            MIN_SECONDARY_WRITE_WIRE_VERSION - 1,
            ReadPreference.secondary
          );
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a standalone', function () {
            expect(servers).to.deep.equal([single]);
          });
        });

        context('when read preference is not provided', function () {
          const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION - 1);
          const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

          it('selects a standalone', function () {
            expect(servers).to.deep.equal([single]);
          });
        });
      });

      context('when a common wire version is not provided', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Single,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );
        const selector = secondaryWritableServerSelector();
        const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a standalone', function () {
          expect(servers).to.deep.equal([single]);
        });
      });
    });

    context('localThresholdMS is respected as an option', function () {
      let serverDescription1, serverDescription2, serverDescription3, serverDescriptions;
      beforeEach(() => {
        serverDescription1 = new ServerDescription(
          '127.0.0.1:27017',
          {
            setName: 'test',
            isWritablePrimary: true,
            ok: 1
          },
          { roundTripTime: 15 }
        );
        serverDescription2 = new ServerDescription(
          '127.0.0.1:27018',
          {
            setName: 'test',
            secondary: true,
            ok: 1
          },
          { roundTripTime: 25 }
        );
        serverDescription3 = new ServerDescription(
          '127.0.0.1:27019',
          {
            setName: 'test',
            secondary: true,
            ok: 1
          },
          { roundTripTime: 35 }
        );
        serverDescriptions = new Map();
        serverDescriptions.set(serverDescription1.address, serverDescription1);
        serverDescriptions.set(serverDescription2.address, serverDescription2);
        serverDescriptions.set(serverDescription3.address, serverDescription3);
      });
      it('includes servers inside the latency window with default localThresholdMS', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Single,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION
        );
        const selector = secondaryWritableServerSelector();
        const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));
        expect(servers).to.have.lengthOf(2);
        const selectedAddresses = new Set(servers.map(({ address }) => address));
        expect(selectedAddresses.has(serverDescription1.address)).to.be.true;
        expect(selectedAddresses.has(serverDescription2.address)).to.be.true;
        expect(selectedAddresses.has(serverDescription3.address)).to.be.false;
      });

      it('includes servers inside the latency window with custom localThresholdMS', function () {
        const topologyDescription = new TopologyDescription(
          TopologyType.Single,
          serverDescriptions,
          'test',
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          new ObjectId(),
          MIN_SECONDARY_WRITE_WIRE_VERSION,
          { localThresholdMS: 5 }
        );
        const selector = secondaryWritableServerSelector();
        const servers = selector(topologyDescription, Array.from(serverDescriptions.values()));
        expect(servers).to.have.lengthOf(1);
        const selectedAddresses = new Set(servers.map(({ address }) => address));
        expect(selectedAddresses.has(serverDescription1.address)).to.be.true;
        expect(selectedAddresses.has(serverDescription2.address)).to.be.false;
        expect(selectedAddresses.has(serverDescription3.address)).to.be.false;
      });
    });
  });
});
