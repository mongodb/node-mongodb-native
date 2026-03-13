import { expect } from 'chai';

import { ServerDescription, TopologyDescription, TopologyType } from '../../mongodb';

describe('TopologyDescription', function () {
  describe('#constructor', function () {
    it('sets commonWireVersion to 0', function () {
      const initial = new TopologyDescription(TopologyType.ReplicaSetWithPrimary);

      expect(initial.commonWireVersion).to.equal(0);
    });
  });

  describe('update()', function () {
    it('initializes commonWireVersion from first non-zero maxWireVersion', function () {
      const initial = new TopologyDescription(TopologyType.ReplicaSetWithPrimary);

      const sd1 = new ServerDescription('a:27017', {
        maxWireVersion: 25
      });

      const updated = initial.update(sd1);

      expect(updated.commonWireVersion).to.equal(25);
    });

    it('tracks the minimum non-zero maxWireVersion across updates in commonWireVersion', function () {
      const initial = new TopologyDescription(TopologyType.ReplicaSetWithPrimary);

      const sd1 = new ServerDescription('a:27017', {
        maxWireVersion: 25
      });

      const sd2 = new ServerDescription('b:27017', {
        maxWireVersion: 21
      });

      let updated = initial.update(sd1);
      updated = updated.update(sd2);

      expect(updated.commonWireVersion).to.equal(21);
    });

    it('ignores servers with maxWireVersion === 0 when computing commonWireVersion', function () {
      const initial = new TopologyDescription(TopologyType.ReplicaSetWithPrimary);

      const sd1 = new ServerDescription('a:27017', {
        maxWireVersion: 25
      });

      const sdUnknown = new ServerDescription('b:27017', {
        maxWireVersion: 0
      });

      let updated = initial.update(sd1);
      updated = updated.update(sdUnknown);

      expect(updated.commonWireVersion).to.equal(25);
    });
  });
});
