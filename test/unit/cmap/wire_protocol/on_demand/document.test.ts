import { Binary, BSON, BSONError, BSONType, ObjectId, Timestamp } from 'bson';
import { expect } from 'chai';

import { OnDemandDocument } from '../../../../mongodb';

describe('class OnDemandDocument', () => {
  context('when given an empty BSON sequence', () => {
    it('sets exists cache to false for any key requested', () => {
      const emptyDocument = BSON.serialize({});
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.has('ok')).to.be.false;
      expect(doc.has('$clusterTime')).to.be.false;
      expect(doc).to.have.nested.property('cache.ok', false);
      expect(doc).to.have.nested.property('cache.$clusterTime', false);
    });
  });

  context('when given a BSON document with ok set to 1', () => {
    it('sets exists cache to true for ok', () => {
      const emptyDocument = BSON.serialize({ ok: 1 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.has('ok')).to.be.true;
      expect(doc).to.have.nested.property('cache.ok').that.is.an('object');
    });

    it('sets exists cache to false for any other key', () => {
      const emptyDocument = BSON.serialize({ ok: 1 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.has('$clusterTime')).to.be.false;
      expect(doc).to.have.nested.property('cache.$clusterTime', false);
    });
  });

  context('when given a BSON document with ok set to 0 and code set to 2', () => {
    it('tracks element position when finding match', () => {
      const emptyDocument = BSON.serialize({ ok: 0, code: 2 });
      const doc = new OnDemandDocument(emptyDocument, 0, false);
      expect(doc.has('code')).to.be.true;
      expect(doc).to.have.nested.property('cache.code').that.is.an('object');
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

  context('get()', () => {
    let document: OnDemandDocument;
    let array: OnDemandDocument;
    const input = {
      int: 1,
      double: 1.2,
      long: 2n,
      timestamp: new Timestamp(2n),
      binData: new Binary(Uint8Array.from([1, 2, 3]), 3),
      binDataSubtype2: new Binary(Uint8Array.from([1, 2, 3]), 2),
      bool: true,
      objectId: new ObjectId('01'.repeat(12)),
      string: 'abc',
      date: new Date(0),
      object: { a: 1 },
      array: [1, 2],
      unsupportedType: /abc/,
      [233]: 3
    };

    beforeEach(async function () {
      const bytes = BSON.serialize(input);
      document = new OnDemandDocument(bytes);
      array = new OnDemandDocument(
        BSON.serialize(Object.fromEntries(Object.values(input).entries())),
        0,
        true
      );
    });

    it('supports access by number for arrays', () => {
      expect(array.get(1, BSONType.int)).to.equal(1);
    });

    it('does not support access by number for objects', () => {
      expect(document.get(233, BSONType.int)).to.be.null;
      expect(document.get('233', BSONType.int)).to.equal(3);
    });

    it('returns null if the element does not exist', () => {
      expect(document.get('blah', BSONType.bool)).to.be.null;
    });

    it('returns the javascript value matching the as parameter', () => {
      expect(document.get('bool', BSONType.bool)).to.be.true;
    });

    it('returns null if the BSON value mismatches the requested type', () => {
      expect(document.get('bool', BSONType.int)).to.be.null;
    });

    it('supports requesting multiple types', () => {
      expect(
        document.get('bool', BSONType.int) ??
          document.get('bool', BSONType.long) ??
          document.get('bool', BSONType.bool)
      ).to.be.true;
    });

    it('throws if required is set to true and element name does not exist', () => {
      expect(() => document.get('blah!', BSONType.bool, true)).to.throw(BSONError);
      expect(document).to.have.nested.property('cache.blah!', false);
    });

    it('throws if requested type is unsupported', () => {
      expect(() => {
        // @ts-expect-error: checking a bad BSON type
        document.get('unsupportedType', BSONType.regex);
      }).to.throw(BSONError, /unsupported/i);
    });

    it('caches the value', () => {
      document.has('int');
      expect(document).to.have.nested.property('cache.int.value', undefined);
      document.get('int', BSONType.int);
      expect(document).to.have.nested.property('cache.int.value', 1);
    });

    it('supports returning null for null and undefined bson elements', () => {
      const bson = Uint8Array.from([
        ...[11, 0, 0, 0], // doc size
        ...[6, 97, 0], // a: undefined (6)
        ...[10, 98, 0], // b: null (10)
        0 // doc term
      ]);
      const document = new OnDemandDocument(bson, 0, false);
      expect(document.get('a', BSONType.undefined)).to.be.null;
      expect(document.get('b', BSONType.null)).to.be.null;
    });

    it('supports returning null for null and undefined bson elements', () => {
      const bson = Uint8Array.from([
        ...[11, 0, 0, 0], // doc size
        ...[6, 97, 0], // a: undefined (6)
        ...[10, 98, 0], // b: null (10)
        0 // doc term
      ]);
      const document = new OnDemandDocument(bson, 0, false);
      expect(document.get('a', BSONType.undefined)).to.be.null;
      expect(document.get('b', BSONType.null)).to.be.null;
    });

    it('supports returning int', () => {
      expect(document.get('int', BSONType.int, true)).to.deep.equal(input.int);
    });

    it('supports returning double', () => {
      expect(document.get('double', BSONType.double, true)).to.deep.equal(input.double);
    });

    it('supports returning long', () => {
      expect(document.get('long', BSONType.long, true)).to.deep.equal(input.long);
    });

    it('supports returning timestamp', () => {
      expect(document.get('timestamp', BSONType.timestamp, true)).to.deep.equal(input.timestamp);
    });

    it('supports returning binData', () => {
      expect(document.get('binData', BSONType.binData, true)).to.deep.equal(input.binData);
    });

    it('supports returning binData, subtype 2', () => {
      expect(document.get('binDataSubtype2', BSONType.binData, true)).to.deep.equal(
        input.binDataSubtype2
      );
    });

    it('supports returning binData, subtype 2', () => {
      expect(document.get('binDataSubtype2', BSONType.binData, true)).to.deep.equal(
        input.binDataSubtype2
      );
    });

    it('supports returning bool', () => {
      expect(document.get('bool', BSONType.bool, true)).to.deep.equal(input.bool);
    });

    it('supports returning objectId', () => {
      expect(document.get('objectId', BSONType.objectId, true)).to.deep.equal(input.objectId);
    });

    it('supports returning string', () => {
      expect(document.get('string', BSONType.string, true)).to.deep.equal(input.string);
    });

    it('supports returning date', () => {
      expect(document.get('date', BSONType.date, true)).to.deep.equal(input.date);
    });

    it('supports returning object', () => {
      const o = document.get('object', BSONType.object, true);
      expect(o).to.be.instanceOf(OnDemandDocument);
      expect(o.has('a')).to.be.true;
    });

    it('supports returning array', () => {
      const a = document.get('array', BSONType.array, true);
      expect(a).to.be.instanceOf(OnDemandDocument);
      expect(a.has('0')).to.be.true;
      expect(a.has('1')).to.be.true;
    });
  });

  context('getNumber()', () => {
    let document: OnDemandDocument;
    const input = {
      int: 1,
      long: 2n,
      double: 2.3,
      bool: false,
      boolTrue: true,
      string: 'abc'
    };

    beforeEach(async function () {
      const bytes = BSON.serialize(input);
      document = new OnDemandDocument(bytes);
    });

    it('throws if required is set to true and element name does not exist', () => {
      expect(() => document.getNumber('blah!', true)).to.throw(BSONError);
    });

    it('throws if required is set to true and element is not numeric', () => {
      // just making sure this test does not fail for the non-exist reason
      expect(document.has('string')).to.be.true;
      expect(() => {
        document.getNumber('string', true);
      }).to.throw(BSONError);
    });

    it('returns null if required is set to false and element does not exist', () => {
      expect(document.getNumber('blah!', false)).to.be.null;
      expect(document.getNumber('blah!')).to.be.null;
    });

    it('returns null if required is set to false and element is not numeric', () => {
      // just making sure this test does not fail for the non-exist reason
      expect(document.has('string')).to.be.true;

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
      expect(document.getNumber('boolTrue')).to.equal(1);
    });
  });
});
