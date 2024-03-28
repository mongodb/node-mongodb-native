import { expect } from 'chai';

import {
  Binary,
  BSON,
  BSONError,
  BSONType,
  ObjectId,
  OnDemandDocument,
  Timestamp
} from '../../../../mongodb';

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

    it('tracks element position when finding match', () => {
      const emptyDocument = BSON.serialize({ ok: 0, code: 2 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.hasElement('code')).to.be.true;
      expect(doc).to.have.nested.property('existenceOf.code', true);
      expect(doc).to.not.have.nested.property('indexFound.0');
      expect(doc).to.have.nested.property('indexFound.1', true);
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

  context('getValue()', () => {
    let document: OnDemandDocument;
    const input = {
      int: 1,
      long: 2n,
      timestamp: new Timestamp(2n),
      binData: new Binary(Uint8Array.from([1, 2, 3]), 3),
      bool: true,
      objectId: new ObjectId('01'.repeat(12)),
      string: 'abc',
      date: new Date(0),
      object: { a: 1 },
      array: [1, 2]
    };

    beforeEach(async function () {
      const bytes = BSON.serialize(input);
      document = new OnDemandDocument(bytes);
    });

    it('returns the javascript value matching the as parameter', () => {
      expect(document.getValue('bool', BSONType.bool)).to.be.true;
    });

    it('throws if the BSON value mismatches the requested type', () => {
      expect(() => document.getValue('bool', BSONType.int)).to.throw(BSONError);
    });

    it('throws if required is set to true and element name does not exist', () => {
      expect(() => document.getValue('blah!', BSONType.bool, true)).to.throw(BSONError);
      expect(document).to.have.nested.property('existenceOf.blah!', false);
    });

    it('throws if requested type is unsupported', () => {
      // @ts-expect-error: checking a bad BSON type
      expect(() => document.getValue('bool', 100)).to.throw(BSONError);
    });

    it('caches the value', () => {
      document.getValue('int', BSONType.int);
      expect(document).to.have.nested.property('valueOf.int', 1);
    });

    it('supports returning int', () => {
      expect(document.getValue('int', BSONType.int, true)).to.deep.equal(input.int);
    });

    it('supports returning long', () => {
      expect(document.getValue('long', BSONType.long, true)).to.deep.equal(input.long);
    });

    it('supports returning timestamp', () => {
      expect(document.getValue('timestamp', BSONType.timestamp, true)).to.deep.equal(
        input.timestamp
      );
    });

    it('supports returning binData', () => {
      expect(document.getValue('binData', BSONType.binData, true)).to.deep.equal(input.binData);
    });

    it('supports returning bool', () => {
      expect(document.getValue('bool', BSONType.bool, true)).to.deep.equal(input.bool);
    });

    it('supports returning objectId', () => {
      expect(document.getValue('objectId', BSONType.objectId, true)).to.deep.equal(input.objectId);
    });

    it('supports returning string', () => {
      expect(document.getValue('string', BSONType.string, true)).to.deep.equal(input.string);
    });

    it('supports returning date', () => {
      expect(document.getValue('date', BSONType.date, true)).to.deep.equal(input.date);
    });

    it('supports returning object', () => {
      const o = document.getValue('object', BSONType.object, true);
      expect(o).to.be.instanceOf(OnDemandDocument);
      expect(o).to.have.lengthOf(1);
    });

    it('supports returning array', () => {
      const a = document.getValue('array', BSONType.array, true);
      expect(a).to.be.instanceOf(OnDemandDocument);
      expect(a).to.have.lengthOf(2);
    });
  });

  context('getNumber()', () => {
    let document: OnDemandDocument;
    const input = {
      int: 1,
      long: 2n,
      double: 2.3,
      bool: false,
      string: 'abc'
    };

    beforeEach(async function () {
      const bytes = BSON.serialize(input);
      document = new OnDemandDocument(bytes);
    });

    it('does not cache the result', () => {
      expect(document.getNumber('int')).to.equal(1);
      expect(document).to.not.have.nested.property('valueOf.int');
    });

    it('throws if required is set to true and element name does not exist', () => {
      expect(() => document.getNumber('blah!', true)).to.throw(BSONError);
    });

    it('throws if required is set to true and element is not numeric', () => {
      // just making sure this test does not fail for the non-exist reason
      expect(document.hasElement('string')).to.be.true;
      expect(() => document.getNumber('string', true)).to.throw(BSONError);
    });

    it('returns null if required is set to false and element does not exist', () => {
      expect(document.getNumber('blah!', false)).to.be.null;
      expect(document.getNumber('blah!')).to.be.null;
    });

    it('returns null if required is set to false and element is not numeric', () => {
      // just making sure this test does not fail for the non-exist reason
      expect(document.hasElement('string')).to.be.true;

      expect(document.getNumber('string', false)).to.be.null;
      expect(document.getNumber('string')).to.be.null;
    });

    it('supports parsing int', () => {
      expect(document.getNumber('int')).to.equal(1);
    });

    it('supports parsing long', () => {
      expect(document.getNumber('long')).to.equal(2);
    });

    it('supports parsing double', () => {
      expect(document.getNumber('double')).to.equal(2.3);
    });

    it('supports parsing bool', () => {
      expect(document.getNumber('bool')).to.equal(0);
    });
  });

  context('*valuesAs()', () => {
    let array: OnDemandDocument;
    beforeEach(async function () {
      const bytes = BSON.serialize(
        Object.fromEntries(Array.from({ length: 10 }, () => 1).entries())
      );
      array = new OnDemandDocument(bytes, 0, true);
    });

    it('returns a generator that yields values matching the as BSONType parameter', () => {
      let didRun = false;
      for (const item of array.valuesAs(BSONType.int)) {
        didRun = true;
        expect(item).to.equal(1);
      }
      expect(didRun).to.be.true;
    });

    it('caches the results in valueOf', () => {
      const generator = array.valuesAs(BSONType.int);
      generator.next();
      generator.next();
      expect(array).to.have.nested.property('valueOf.0', 1);
      expect(array).to.have.nested.property('valueOf.1', 1);
    });
  });
});
