import { expect } from 'chai';
import * as sinon from 'sinon';

import { BSON, MongoDBResponse, OnDemandDocument } from '../../../mongodb';

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
