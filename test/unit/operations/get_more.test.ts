import { expect } from 'chai';
import * as sinon from 'sinon';

import { Long } from '../../../src/bson';
import { MongoRuntimeError } from '../../../src/error';
import { GetMoreOperation } from '../../../src/operations/get_more';
import { Aspect } from '../../../src/operations/operation';
import { ReadPreference } from '../../../src/read_preference';
import { Server } from '../../../src/sdam/server';
import { ServerDescription } from '../../../src/sdam/server_description';
import { Topology } from '../../../src/sdam/topology';
import { ClientSession } from '../../../src/sessions';
import { MongoDBNamespace } from '../../../src/utils';

describe('GetMoreOperation', function () {
  const ns = new MongoDBNamespace('db.coll');
  const cursorId = Object.freeze(Long.fromNumber(1));
  const options = {
    batchSize: 100,
    maxTimeMS: 500,
    readPreference: ReadPreference.primary
  };

  describe('#constructor', function () {
    const server = new Server(new Topology([], {} as any), new ServerDescription(''), {} as any);
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

    context('options', function () {
      const optionsWithComment = {
        ...options,
        comment: 'test'
      };
      it('does not set the comment option if the server version is <4', () => {
        const server = new Server(
          new Topology([], {} as any),
          new ServerDescription(''),
          {} as any
        );
        server.hello = {
          maxWireVersion: 8
        };
        const operation = new GetMoreOperation(ns, cursorId, server, optionsWithComment);
        const expected = {
          batchSize: 100,
          maxTimeMS: 500,
          readPreference: ReadPreference.primary
        };
        expect(operation.options).to.deep.equal(expected);
      });

      it('sets the comment option if the server version is >=4', () => {
        const server = new Server(
          new Topology([], {} as any),
          new ServerDescription(''),
          {} as any
        );
        server.hello = {
          maxWireVersion: 10
        };
        const operation = new GetMoreOperation(ns, cursorId, server, optionsWithComment);
        expect(operation.options).to.deep.equal(optionsWithComment);
      });
    });
  });

  describe('#execute', function () {
    context('when the server is the same as the instance', function () {
      const server = new Server(new Topology([], {} as any), new ServerDescription(''), {} as any);
      const session = sinon.createStubInstance(ClientSession);
      const opts = { ...options, session };
      const operation = new GetMoreOperation(ns, cursorId, server, opts);

      const stub = sinon.stub(server, 'getMore').callsFake((_, __, ___, cb) => {
        console.error('executing');
        cb();
      });

      it('executes a getMore on the provided server', function (done) {
        const callback = () => {
          const call = stub.getCall(0);
          expect(stub.calledOnce).to.be.true;
          expect(call.args[0]).to.equal(ns);
          expect(call.args[1]).to.equal(cursorId);
          expect(call.args[2]).to.deep.equal(opts);
          done();
        };
        operation.execute(server, session, callback);
      });
    });

    context('when the server is not the same as the instance', function () {
      const server1 = new Server(new Topology([], {} as any), new ServerDescription(''), {} as any);
      const server2 = new Server(new Topology([], {} as any), new ServerDescription(''), {} as any);
      const session = sinon.createStubInstance(ClientSession);
      const opts = { ...options, session };
      const operation = new GetMoreOperation(ns, cursorId, server1, opts);

      it('errors in the callback', function (done) {
        const callback = error => {
          expect(error).to.be.instanceOf(MongoRuntimeError);
          expect(error.message).to.equal('Getmore must run on the same server operation began on');
          done();
        };
        operation.execute(server2, session, callback);
      });
    });
  });

  describe('#hasAspect', function () {
    const server = new Server(new Topology([], {} as any), new ServerDescription(''), {} as any);
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
