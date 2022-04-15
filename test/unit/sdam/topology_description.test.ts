import { expect } from 'chai';

import { TopologyType } from '../../../src/sdam/common';
import {
  TopologyDescription,
  TopologyDescriptionOptions
} from '../../../src/sdam/topology_description';

describe('TopologyDescription (unit)', function () {
  describe('#constructor', () => {
    context('localThresholdMS', function () {
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
  });
});
