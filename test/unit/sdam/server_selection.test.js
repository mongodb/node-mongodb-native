'use strict';

const { expect } = require('chai');
const { ObjectId } = require('../../../src/bson');
const { ReadPreference } = require('../../../src/read_preference');
const {
  secondaryWritableServerSelector,
  MIN_SECONDARY_WRITE_WIRE_VERSION
} = require('../../../src/sdam/server_selection');
const { ServerDescription } = require('../../../src/sdam/server_description');
const { TopologyDescription } = require('../../../src/sdam/topology_description');
const { TopologyType } = require('../../../src/sdam/common');

describe('ServerSelector', function () {
  describe('#secondaryWritableServerSelector', function () {
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
    const serverDescriptions = new Map();
    serverDescriptions.set('127.0.0.1:27017', primary);
    serverDescriptions.set('127.0.0.1:27018', secondary);

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
        const server = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('uses the provided read preference', function () {
          expect(server).to.deep.equal([secondary]);
        });
      });

      context('when a read preference is not provided', function () {
        const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION);
        const server = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a primary', function () {
          expect(server).to.deep.equal([primary]);
        });
      });
    });

    context('when the common server version is < 5.0', function () {
      const topologyDescription = new TopologyDescription(
        TopologyType.ReplicaSetWithPrimary,
        serverDescriptions,
        'test',
        MIN_SECONDARY_WRITE_WIRE_VERSION - 1,
        new ObjectId(),
        MIN_SECONDARY_WRITE_WIRE_VERSION - 1
      );

      context('when a read preference is provided', function () {
        const selector = secondaryWritableServerSelector(
          MIN_SECONDARY_WRITE_WIRE_VERSION - 1,
          ReadPreference.secondary
        );
        const server = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a primary', function () {
          expect(server).to.deep.equal([primary]);
        });
      });

      context('when read preference is not provided', function () {
        const selector = secondaryWritableServerSelector(MIN_SECONDARY_WRITE_WIRE_VERSION - 1);
        const server = selector(topologyDescription, Array.from(serverDescriptions.values()));

        it('selects a primary', function () {
          expect(server).to.deep.equal([primary]);
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
      const selector = secondaryWritableServerSelector();
      const server = selector(topologyDescription, Array.from(serverDescriptions.values()));

      it('selects a primary', function () {
        expect(server).to.deep.equal([primary]);
      });
    });
  });
});
