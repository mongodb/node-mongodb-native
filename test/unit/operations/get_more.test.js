'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const { Long } = require('../../../src/bson');
const { GetMoreOperation } = require('../../../src/operations/get_more');
const { Server } = require('../../../src/sdam/server');
const { ClientSession } = require('../../../src/sessions');
const { ReadPreference } = require('../../../src/read_preference');
const { Aspect } = require('../../../src/operations/operation');
const { MongoRuntimeError } = require('../../../src/error');

describe('GetMoreOperation', function () {
  const ns = 'db.coll';
  const cursorId = Object.freeze(Long.fromNumber(1));
  const options = Object.freeze({
    batchSize: 100,
    comment: 'test',
    maxTimeMS: 500,
    readPreference: ReadPreference.primary
  });

  describe('#constructor', function () {
    const server = sinon.createStubInstance(Server, {});
    const operation = new GetMoreOperation(ns, cursorId, server, options);

    it('sets the namespace', function () {
      expect(operation.ns).to.equal(ns);
    });

    it('sets the cursorId', function () {
      expect(operation.cursorId).to.equal(cursorId);
    });

    it('sets the server', function () {
      expect(operation.server).to.equal(server);
    });

    it('sets the options', function () {
      expect(operation.options).to.deep.equal(options);
    });
  });

  describe('#execute', function () {
    context('when the server is the same as the instance', function () {
      const getMoreStub = sinon.stub().yields(undefined);
      const server = sinon.createStubInstance(Server, {
        getMore: getMoreStub
      });
      const session = sinon.createStubInstance(ClientSession);
      const opts = { ...options, session };
      const operation = new GetMoreOperation(ns, cursorId, server, opts);

      it('executes a getmore on the provided server', function (done) {
        const callback = () => {
          const call = getMoreStub.getCall(0);
          expect(getMoreStub.calledOnce).to.be.true;
          expect(call.args[0]).to.equal(ns);
          expect(call.args[1]).to.equal(cursorId);
          expect(call.args[2]).to.deep.equal(opts);
          done();
        };
        operation.execute(server, session, callback);
      });
    });

    context('when the server is not the same as the instance', function () {
      const getMoreStub = sinon.stub().yields(undefined);
      const server = sinon.createStubInstance(Server, {
        getMore: getMoreStub
      });
      const newServer = sinon.createStubInstance(Server, {
        getMore: getMoreStub
      });
      const session = sinon.createStubInstance(ClientSession);
      const opts = { ...options, session };
      const operation = new GetMoreOperation(ns, cursorId, server, opts);

      it('errors in the callback', function (done) {
        const callback = error => {
          expect(error).to.be.instanceOf(MongoRuntimeError);
          expect(error.message).to.equal('Getmore must run on the same server operation began on');
          done();
        };
        operation.execute(newServer, session, callback);
      });
    });
  });

  describe('#hasAspect', function () {
    const server = sinon.createStubInstance(Server, {});
    const operation = new GetMoreOperation(ns, cursorId, server, options);

    context('when the aspect is cursor iterating', function () {
      it('returns true', function () {
        expect(operation.hasAspect(Aspect.CURSOR_ITERATING)).to.be.true;
      });
    });

    context('when the aspect is read', function () {
      it('returns true', function () {
        expect(operation.hasAspect(Aspect.READ_OPERATION)).to.be.true;
      });
    });

    context('when the aspect is write', function () {
      it('returns false', function () {
        expect(operation.hasAspect(Aspect.WRITE_OPERATION)).to.be.false;
      });
    });

    context('when the aspect is retryable', function () {
      it('returns false', function () {
        expect(operation.hasAspect(Aspect.RETRYABLE)).to.be.false;
      });
    });
  });
});
