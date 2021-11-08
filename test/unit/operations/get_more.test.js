'use strict';

const sinon = require('sinon');
const { expect } = require('chai');
const { Long } = require('../../../src/bson');
const { GetMoreOperation } = require('../../../src/operations/get_more');
const { Server } = require('../../../src/sdam/server');
const { ClientSession } = require('../../../src/sessions');

describe('GetMoreOperation', function () {
  const ns = 'db.coll';
  const cursorId = Long.fromNumber(1);
  const options = { batchSize: 100, comment: 'test', maxTimeMS: 500 };

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
    const getMoreStub = sinon.stub().yields(undefined);
    const server = sinon.createStubInstance(Server, {
      getMore: getMoreStub
    });
    const session = sinon.createStubInstance(ClientSession);
    const operation = new GetMoreOperation(ns, cursorId, server, options);

    it('executes a getmore on the provided server', function (done) {
      const callback = () => {
        const call = getMoreStub.getCall(0);
        expect(getMoreStub.calledOnce).to.be.true;
        expect(call.args[0]).to.equal(ns);
        expect(call.args[1]).to.equal(cursorId);
        expect(call.args[2]).to.deep.equal({ ...options, session });
        done();
      };
      operation.execute(server, session, callback);
    });
  });
});
