import { expect } from 'chai';

import { BSON, OnDemandDocument } from '../../../../mongodb';

describe('class OnDemandDocument', () => {
  context('when given an empty BSON sequence', () => {
    it('has a length of 0', () => {
      const emptyDocument = BSON.serialize({});
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc).to.have.lengthOf(0);
    });

    it('sets exists cache to false for any key requested', () => {
      const emptyDocument = BSON.serialize({});
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.hasElement('ok')).to.be.false;
      expect(doc.hasElement('$clusterTime')).to.be.false;
      expect(doc).to.have.nested.property('existenceOf.ok', false);
      expect(doc).to.have.nested.property('existenceOf.$clusterTime', false);
    });
  });

  context('when given a BSON document with ok set to 1', () => {
    it('has a length of 1', () => {
      const emptyDocument = BSON.serialize({ ok: 1 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc).to.have.lengthOf(1);
    });

    it('sets exists cache to true for ok', () => {
      const emptyDocument = BSON.serialize({ ok: 1 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.hasElement('ok')).to.be.true;
      expect(doc).to.have.nested.property('existenceOf.ok', true);
    });

    it('sets exists cache to false for any other key', () => {
      const emptyDocument = BSON.serialize({ ok: 1 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.hasElement('$clusterTime')).to.be.false;
      expect(doc).to.have.nested.property('existenceOf.$clusterTime', false);
    });
  });

  context('when given a BSON document with ok set to 0 and code set to 2', () => {
    it('has a length of 2', () => {
      const emptyDocument = BSON.serialize({ ok: 0, code: 2 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc).to.have.lengthOf(2);
    });

    it('clears element position when finding match', () => {
      const emptyDocument = BSON.serialize({ ok: 0, code: 2 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.hasElement('ok')).to.be.true;
      expect(doc).to.have.nested.property('existenceOf.ok', true);
      expect(doc).to.have.nested.property('elements[0]').to.be.null;
      expect(doc).to.have.nested.property('elements[1]').to.not.be.null;
    });
  });

  context('toObject()', () => {
    it('returns the results of calling BSON.deserialize on the document bytes', () => {
      const offsetDocument = new Uint8Array([0, 0, 0, ...BSON.serialize({ ok: 0, code: 2 })]);
      const doc = new OnDemandDocument(offsetDocument, 3, false);
      expect(doc.toObject()).to.deep.equal(
        BSON.deserialize(offsetDocument, { index: 3, allowObjectSmallerThanBufferSize: true })
      );
    });

    it('supports BSON options', () => {
      const offsetDocument = new Uint8Array([0, 0, 0, ...BSON.serialize({ ok: 0, code: 2 })]);
      const doc = new OnDemandDocument(offsetDocument, 3, false);
      expect(doc.toObject({ promoteValues: false })).to.deep.equal(
        BSON.deserialize(offsetDocument, {
          index: 3,
          allowObjectSmallerThanBufferSize: true,
          promoteValues: false
        })
      );
    });
  });
});
