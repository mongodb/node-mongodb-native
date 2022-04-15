import { ObjectId } from 'bson';
import { expect } from 'chai';

import { TopologyType } from '../../../src/sdam/common';
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
  });
});
