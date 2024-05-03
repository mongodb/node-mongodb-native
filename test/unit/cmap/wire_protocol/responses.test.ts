import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  BSON,
  BSONError,
  CursorResponse,
  Int32,
  MongoDBResponse,
  MongoUnexpectedServerResponseError,
  OnDemandDocument
} from '../../../mongodb';

describe('class MongoDBResponse', () => {
  it('is a subclass of OnDemandDocument', () => {
    expect(new MongoDBResponse(BSON.serialize({ ok: 1 }))).to.be.instanceOf(OnDemandDocument);
  });

  context('get isError', () => {
    it('returns true when ok is 0', () => {
      const doc = new MongoDBResponse(BSON.serialize({ ok: 0 }));
      expect(doc.isError).to.be.true;
    });

    it('returns true when $err is defined', () => {
      const doc = new MongoDBResponse(BSON.serialize({ $err: 0 }));
      expect(doc.isError).to.be.true;
    });

    it('returns true when errmsg is defined', () => {
      const doc = new MongoDBResponse(BSON.serialize({ errmsg: 0 }));
      expect(doc.isError).to.be.true;
    });

    it('returns true when code is defined', () => {
      const doc = new MongoDBResponse(BSON.serialize({ code: 0 }));
      expect(doc.isError).to.be.true;
    });

    it('short circuits detection of $err, errmsg, code', () => {
      const doc = new MongoDBResponse(BSON.serialize({ ok: 0 }));
      expect(doc.isError).to.be.true;
      expect(doc).to.not.have.property('cache.$err');
      expect(doc).to.not.have.property('cache.errmsg');
      expect(doc).to.not.have.property('cache.code');
    });
  });

  context('utf8 validation', () => {
    afterEach(() => sinon.restore());

    context('when enableUtf8Validation is not specified', () => {
      const options = { enableUtf8Validation: undefined };
      it('calls BSON deserialize with writeErrors validation turned off', () => {
        const res = new MongoDBResponse(BSON.serialize({}));
        const toObject = sinon.spy(Object.getPrototypeOf(Object.getPrototypeOf(res)), 'toObject');
        res.toObject(options);
        expect(toObject).to.have.been.calledWith(
          sinon.match({ validation: { utf8: { writeErrors: false } } })
        );
      });
    });

    context('when enableUtf8Validation is true', () => {
      const options = { enableUtf8Validation: true };
      it('calls BSON deserialize with writeErrors validation turned off', () => {
        const res = new MongoDBResponse(BSON.serialize({}));
        const toObject = sinon.spy(Object.getPrototypeOf(Object.getPrototypeOf(res)), 'toObject');
        res.toObject(options);
        expect(toObject).to.have.been.calledWith(
          sinon.match({ validation: { utf8: { writeErrors: false } } })
        );
      });
    });

    context('when enableUtf8Validation is false', () => {
      const options = { enableUtf8Validation: false };
      it('calls BSON deserialize with all validation disabled', () => {
        const res = new MongoDBResponse(BSON.serialize({}));
        const toObject = sinon.spy(Object.getPrototypeOf(Object.getPrototypeOf(res)), 'toObject');
        res.toObject(options);
        expect(toObject).to.have.been.calledWith(sinon.match({ validation: { utf8: false } }));
      });
    });
  });
});

describe('class CursorResponse', () => {
  describe('constructor()', () => {
    it('throws if input does not contain cursor embedded document', () => {
      expect(() => new CursorResponse(BSON.serialize({ ok: 1 }))).to.throw(BSONError);
    });

    it('throws if input does not contain cursor.id int64', () => {
      expect(() => new CursorResponse(BSON.serialize({ ok: 1, cursor: {} }))).to.throw(BSONError);
    });

    it('sets namespace to null if input does not contain cursor.ns', () => {
      expect(new CursorResponse(BSON.serialize({ ok: 1, cursor: { id: 0n, firstBatch: [] } })).ns)
        .to.be.null;
    });

    it('throws if input does not contain firstBatch nor nextBatch', () => {
      expect(
        () => new CursorResponse(BSON.serialize({ ok: 1, cursor: { id: 0n, batch: [] } }))
      ).to.throw(MongoUnexpectedServerResponseError);
    });

    it('reports a length equal to the batch', () => {
      expect(
        new CursorResponse(BSON.serialize({ ok: 1, cursor: { id: 0n, nextBatch: [1, 2, 3] } }))
      ).to.have.lengthOf(3);
    });
  });

  describe('shift()', () => {
    let response;

    beforeEach(async function () {
      response = new CursorResponse(
        BSON.serialize({
          ok: 1,
          cursor: { id: 0n, nextBatch: [{ _id: 1 }, { _id: 2 }, { _id: 3 }] }
        })
      );
    });

    it('returns a document from the batch', () => {
      expect(response.shift()).to.deep.equal({ _id: 1 });
      expect(response.shift()).to.deep.equal({ _id: 2 });
      expect(response.shift()).to.deep.equal({ _id: 3 });
      expect(response.shift()).to.deep.equal(null);
    });

    it('passes BSON options to deserialization', () => {
      expect(response.shift({ promoteValues: false })).to.deep.equal({ _id: new Int32(1) });
      expect(response.shift({ promoteValues: true })).to.deep.equal({ _id: 2 });
      expect(response.shift({ promoteValues: false })).to.deep.equal({ _id: new Int32(3) });
      expect(response.shift()).to.deep.equal(null);
    });
  });

  describe('clear()', () => {
    let response;

    beforeEach(async function () {
      response = new CursorResponse(
        BSON.serialize({
          ok: 1,
          cursor: { id: 0n, nextBatch: [{ _id: 1 }, { _id: 2 }, { _id: 3 }] }
        })
      );
    });

    it('makes length equal to 0', () => {
      expect(response.clear()).to.be.undefined;
      expect(response).to.have.lengthOf(0);
    });

    it('makes shift return null', () => {
      expect(response.clear()).to.be.undefined;
      expect(response.shift()).to.be.null;
    });
  });

  describe('pushMany()', () =>
    it('throws unsupported error', () =>
      expect(CursorResponse.prototype.pushMany).to.throw(/Unsupported/i)));

  describe('push()', () =>
    it('throws unsupported error', () =>
      expect(CursorResponse.prototype.push).to.throw(/Unsupported/i)));
});
