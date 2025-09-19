import { expect } from 'chai';
import { CursorResponse, MongoDBResponse } from '../../../../src/cmap/wire_protocol/responses';
import { Int32, serialize } from '../../../../src/bson';
import { OnDemandDocument } from '../../../../src/cmap/wire_protocol/on_demand/document';
import { MongoUnexpectedServerResponseError } from '../../../../src/error';

describe('class MongoDBResponse', () => {
  it('is a subclass of OnDemandDocument', () => {
    expect(new MongoDBResponse(serialize({ ok: 1 }))).to.be.instanceOf(OnDemandDocument);
  });
});

describe('class CursorResponse', () => {
  describe('get cursor()', () => {
    it('throws if input does not contain cursor embedded document', () => {
      expect(() => new CursorResponse(serialize({ ok: 1 })).cursor).to.throw(
        MongoUnexpectedServerResponseError,
        /"cursor" is missing/
      );
    });
  });

  describe('get id()', () => {
    it('throws if input does not contain cursor.id int64', () => {
      expect(() => new CursorResponse(serialize({ ok: 1, cursor: {} })).id).to.throw(
        MongoUnexpectedServerResponseError,
        /"id" is missing/
      );
    });
  });

  describe('get batch()', () => {
    it('throws if input does not contain firstBatch nor nextBatch', () => {
      expect(
        // @ts-expect-error: testing private getter
        () => new CursorResponse(serialize({ ok: 1, cursor: { id: 0n, batch: [] } })).batch
      ).to.throw(MongoUnexpectedServerResponseError, /did not contain a batch/);
    });
  });

  describe('get ns()', () => {
    it('sets namespace to null if input does not contain cursor.ns', () => {
      expect(new CursorResponse(serialize({ ok: 1, cursor: { id: 0n, firstBatch: [] } })).ns).to.be
        .null;
    });
  });

  describe('get batchSize()', () => {
    it('reports the returned batch size', () => {
      const response = new CursorResponse(
        serialize({ ok: 1, cursor: { id: 0n, nextBatch: [{}, {}, {}] } })
      );
      expect(response.batchSize).to.equal(3);
      expect(response.shift()).to.deep.equal({});
      expect(response.batchSize).to.equal(3);
    });
  });

  describe('get length()', () => {
    it('reports number of documents remaining in the batch', () => {
      const response = new CursorResponse(
        serialize({ ok: 1, cursor: { id: 0n, nextBatch: [{}, {}, {}] } })
      );
      expect(response).to.have.lengthOf(3);
      expect(response.shift()).to.deep.equal({});
      expect(response).to.have.lengthOf(2); // length makes CursorResponse act like an array
    });
  });

  describe('shift()', () => {
    let response;

    beforeEach(async function () {
      response = new CursorResponse(
        serialize({
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
        serialize({
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
});
