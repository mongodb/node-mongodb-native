import { expect } from 'chai';
import * as sinon from 'sinon';

// to spy on the bson module, we must import it from the driver
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import * as mdb from '../../../../src/bson';
import {
  CursorResponse,
  Int32,
  MongoDBResponse,
  MongoUnexpectedServerResponseError,
  OnDemandDocument,
  serialize
} from '../../../mongodb';

describe('class MongoDBResponse', () => {
  it('is a subclass of OnDemandDocument', () => {
    expect(new MongoDBResponse(serialize({ ok: 1 }))).to.be.instanceOf(OnDemandDocument);
  });

  context('utf8 validation', () => {
    let deseriailzeSpy: sinon.SinonStub<Parameters<typeof mdb.deserialize>>;
    beforeEach(function () {
      const deserialize = mdb.deserialize;
      deseriailzeSpy = sinon.stub<Parameters<typeof deserialize>>().callsFake(deserialize);
      sinon.stub(mdb, 'deserialize').get(() => {
        return deseriailzeSpy;
      });
    });
    afterEach(function () {
      sinon.restore();
    });

    context('when enableUtf8Validation is not specified', () => {
      const options = { enableUtf8Validation: undefined };
      it('calls BSON deserialize with writeErrors validation turned off', () => {
        const res = new MongoDBResponse(serialize({}));
        res.toObject(options);

        expect(deseriailzeSpy).to.have.been.called;

        const [
          {
            args: [_buffer, { validation }]
          }
        ] = deseriailzeSpy.getCalls();

        expect(validation).to.deep.equal({ utf8: { writeErrors: false } });
      });
    });

    context('when enableUtf8Validation is true', () => {
      const options = { enableUtf8Validation: true };
      it('calls BSON deserialize with writeErrors validation turned off', () => {
        const res = new MongoDBResponse(serialize({}));
        res.toObject(options);

        expect(deseriailzeSpy).to.have.been.called;

        const [
          {
            args: [_buffer, { validation }]
          }
        ] = deseriailzeSpy.getCalls();

        expect(validation).to.deep.equal({ utf8: { writeErrors: false } });
      });
    });

    context('when enableUtf8Validation is false', () => {
      const options = { enableUtf8Validation: false };
      it('calls BSON deserialize with all validation disabled', () => {
        const res = new MongoDBResponse(serialize({}));
        res.toObject(options);

        expect(deseriailzeSpy).to.have.been.called;

        const [
          {
            args: [_buffer, { validation }]
          }
        ] = deseriailzeSpy.getCalls();

        expect(validation).to.deep.equal({ utf8: false });
      });
    });
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
