import { ObjectId } from 'bson';
import { expect } from 'chai';

import {
  MAX_SUPPORTED_SERVER_VERSION,
  MAX_SUPPORTED_WIRE_VERSION,
  MIN_SUPPORTED_SERVER_VERSION,
  MIN_SUPPORTED_WIRE_VERSION
} from '../../../src/cmap/wire_protocol/constants';
import { TopologyType } from '../../../src/sdam/common';
import { ServerDescription } from '../../../src/sdam/server_description';
import { TopologyDescription } from '../../../src/sdam/topology_description';

describe('TopologyDescription (unit)', function () {
  describe('#constructor', () => {
    it('#type', function () {
      it('defaults to Unknown', function () {
        // perhaps an unnecessary test, but we do have a default for the type set in the
        // constructor.
        // @ts-expect-error TopologyDescription requires a type when constructed
        const description = new TopologyDescription();
        expect(description).to.haveOwnProperty('type').to.equal(TopologyType.Unknown);
      });

      it('defaults to Unknown', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).to.haveOwnProperty('type').to.equal(TopologyType.Single);
      });
    });

    it('#stale', function () {
      const description = new TopologyDescription(TopologyType.Single);
      expect(description).to.haveOwnProperty('stale').to.be.false;
    });

    describe('#compatible', function () {
      it('defaults to true', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).to.haveOwnProperty('compatible').to.be.true;
        expect(description).not.to.haveOwnProperty('compatibilityError');
      });
    });

    context('#setName', function () {
      it('does not exist if not provided', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).not.to.haveOwnProperty('setName');
      });
      it('is set when passed in as an option', function () {
        const description = new TopologyDescription(
          TopologyType.Single,
          undefined,
          'setNameValue',
          undefined,
          undefined,
          undefined,
          {}
        );
        expect(description).to.haveOwnProperty('setName').to.equal('setNameValue');
      });
    });

    context('#maxSetVersion', function () {
      it('does not exist if not provided', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).not.to.haveOwnProperty('maxSetVersion');
      });
      it('is set when passed in as an option', function () {
        const description = new TopologyDescription(
          TopologyType.Single,
          undefined,
          undefined,
          25,
          undefined,
          undefined,
          {}
        );
        expect(description).to.haveOwnProperty('maxSetVersion').to.equal(25);
      });
    });

    context('#maxElectionId', function () {
      it('does not exist if not provided', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).not.to.haveOwnProperty('maxElectionId');
      });
      it('is set when passed in as an option', function () {
        const objectId = new ObjectId(25);
        const description = new TopologyDescription(
          TopologyType.Single,
          undefined,
          undefined,
          undefined,
          objectId,
          undefined,
          {}
        );
        expect(description).to.haveOwnProperty('maxElectionId').to.equal(objectId);
      });
    });

    context('#commonWireVersion', function () {
      it('does not exist if not provided', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).not.to.haveOwnProperty('commonWireVersion');
      });
      it('is set when passed in as an option', function () {
        const description = new TopologyDescription(
          TopologyType.Single,
          undefined,
          undefined,
          undefined,
          undefined,
          25,
          {}
        );
        expect(description).to.haveOwnProperty('commonWireVersion').to.equal(25);
      });
    });

    context('#localThresholdMS', function () {
      it('defaults to 15ms', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).to.haveOwnProperty('localThresholdMS').to.equal(15);
      });
      it('is set when passed in as an option', function () {
        const description = new TopologyDescription(
          TopologyType.Single,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { localThresholdMS: 30 }
        );
        expect(description).to.haveOwnProperty('localThresholdMS').to.equal(30);
      });
    });

    context('#heartbeatFrequencyMS', function () {
      it('defaults to 0ms', function () {
        const description = new TopologyDescription(TopologyType.Single);
        expect(description).to.haveOwnProperty('heartbeatFrequencyMS').to.equal(0);
      });

      it('is set when passed in as an option', function () {
        const description = new TopologyDescription(
          TopologyType.Single,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { heartbeatFrequencyMS: 30 }
        );
        expect(description).to.haveOwnProperty('heartbeatFrequencyMS').to.equal(30);
      });
    });

    context('server compatability', function () {
      const validServer = new ServerDescription('localhost:27017', {
        maxWireVersion: 8,
        minWireVersion: 6,
        ok: 1,
        isreplicaset: true
      });
      const serverWithVersionTooLow = new ServerDescription('localhost:27018', {
        maxWireVersion: MIN_SUPPORTED_WIRE_VERSION - 1,
        minWireVewion: MIN_SUPPORTED_WIRE_VERSION - 2,
        ok: 1,
        isreplicaset: true
      });
      const serverWithVersionTooHigh = new ServerDescription('localhost:27017', {
        maxWireVersion: MAX_SUPPORTED_WIRE_VERSION + 2,
        minWireVersion: MAX_SUPPORTED_WIRE_VERSION + 1,
        ok: 1,
        isreplicaset: true
      });
      it('does not set a compatibility error if all servers are compatible', function () {
        const map: Map<string, ServerDescription> = new Map();
        map.set(validServer.address, validServer);
        const topology = new TopologyDescription(TopologyType.Single, map);
        expect(topology).not.to.haveOwnProperty('compatibilityError');
        expect(topology).to.haveOwnProperty('compatible').to.be.true;
      });

      it('sets a compatibility error if a server has a min wire version above the maximum supported version', function () {
        const map: Map<string, ServerDescription> = new Map();
        map.set(serverWithVersionTooHigh.address, serverWithVersionTooHigh);
        const topology = new TopologyDescription(TopologyType.Single, map);
        expect(topology)
          .to.haveOwnProperty('compatibilityError')
          .to.equal(
            `Server at ${serverWithVersionTooHigh.address} requires wire version ${serverWithVersionTooHigh.minWireVersion}, but this version of the driver only supports up to ${MAX_SUPPORTED_WIRE_VERSION} (MongoDB ${MAX_SUPPORTED_SERVER_VERSION})`
          );
        expect(topology).to.haveOwnProperty('compatible').to.be.false;
      });

      it('sets a compatibility error if a server has a max wire version below the minimum supported version', function () {
        const map: Map<string, ServerDescription> = new Map();
        map.set(serverWithVersionTooLow.address, serverWithVersionTooLow);
        const topology = new TopologyDescription(TopologyType.Single, map);
        expect(topology)
          .to.haveOwnProperty('compatibilityError')
          .to.equal(
            `Server at ${serverWithVersionTooLow.address} reports wire version ${serverWithVersionTooLow.maxWireVersion}, but this version of the driver requires at least ${MIN_SUPPORTED_WIRE_VERSION} (MongoDB ${MIN_SUPPORTED_SERVER_VERSION}).`
          );
        expect(topology).to.haveOwnProperty('compatible').to.be.false;
      });
    });
  });
});
