import { expect } from 'chai';
import * as sinon from 'sinon';
import { promisify } from 'util';

import {
  Aspect,
  ClientSession,
  GetMoreOperation,
  Long,
  MongoRuntimeError,
  ns,
  ReadPreference,
  Server,
  ServerDescription,
  Topology
} from '../../mongodb';

describe('GetMoreOperation', function () {
  const namespace = ns('db.coll');
  const cursorId = Object.freeze(Long.fromNumber(1));
  const options = {
    batchSize: 100,
    maxAwaitTimeMS: 500,
    readPreference: ReadPreference.primary
  };
  afterEach(function () {
    sinon.restore();
  });

  describe('#constructor', function () {
    const server = new Server(new Topology([], {} as any), new ServerDescription('a:1'), {} as any);
    const operation = new GetMoreOperation(namespace, cursorId, server, options);

    it('sets the namespace', function () {
      expect(operation.ns).to.equal(namespace);
    });

    it('sets the cursorId', function () {
      expect(operation.cursorId).to.equal(cursorId);
    });

    it('sets the server', function () {
      expect(operation.server).to.equal(server);
    });
  });

  describe('#execute', function () {
    context('when the server is the same as the instance', function () {
      it('executes a getMore on the provided server', async function () {
        const server = new Server(
          new Topology([], {} as any),
          new ServerDescription('a:1'),
          {} as any
        );
        const opts = { ...options, documentsReturnedIn: 'nextBatch', returnFieldSelector: null };
        const operation = new GetMoreOperation(namespace, cursorId, server, opts);
        const stub = sinon.stub(server, 'command').callsFake((_, __, ___, cb) => cb());

        const expectedGetMoreCommand = {
          getMore: cursorId,
          collection: namespace.collection,
          batchSize: 100,
          maxTimeMS: 500
        };

        await promisify(operation.execute.bind(operation))(server, undefined);
        expect(stub.calledOnce).to.be.true;
        const call = stub.getCall(0);
        expect(call.args[0]).to.equal(namespace);
        expect(call.args[1]).to.deep.equal(expectedGetMoreCommand);
        expect(call.args[2]).to.deep.equal(opts);
      });
    });

    context('when the server is not the same as the instance', function () {
      it('errors in the callback', function (done) {
        const server1 = new Server(
          new Topology([], {} as any),
          new ServerDescription('a:1'),
          {} as any
        );
        const server2 = new Server(
          new Topology([], {} as any),
          new ServerDescription('a:1'),
          {} as any
        );
        const session = sinon.createStubInstance(ClientSession);
        const opts = { ...options, session };
        const operation = new GetMoreOperation(namespace, cursorId, server1, opts);
        const callback = error => {
          expect(error).to.be.instanceOf(MongoRuntimeError);
          expect(error.message).to.equal('Getmore must run on the same server operation began on');
          done();
        };
        operation.execute(server2, session, callback);
      });
    });

    context('command construction', () => {
      const cursorId = Long.fromBigInt(0xffff_ffffn);
      const namespace = ns('db.collection');
      const server = new Server(
        new Topology([], {} as any),
        new ServerDescription('a:1'),
        {} as any
      );

      it('should build basic getMore command with cursorId and collection', async () => {
        const getMoreOperation = new GetMoreOperation(namespace, cursorId, server, {});
        const stub = sinon.stub(server, 'command').yieldsRight();
        await promisify(getMoreOperation.execute.bind(getMoreOperation))(server, undefined);
        expect(stub).to.have.been.calledOnceWith(namespace, {
          getMore: cursorId,
          collection: namespace.collection
        });
      });

      it('should build getMore command with batchSize', async () => {
        const options = {
          batchSize: 234
        };
        const getMoreOperation = new GetMoreOperation(namespace, cursorId, server, options);
        const stub = sinon.stub(server, 'command').yieldsRight();
        await promisify(getMoreOperation.execute.bind(getMoreOperation))(server, undefined);
        expect(stub).to.have.been.calledOnceWith(
          namespace,
          sinon.match.has('batchSize', options.batchSize)
        );
      });

      it('should build getMore command with maxTimeMS if maxAwaitTimeMS specified', async () => {
        const options = {
          maxAwaitTimeMS: 234
        };
        const getMoreOperation = new GetMoreOperation(namespace, cursorId, server, options);
        const stub = sinon.stub(server, 'command').yieldsRight();
        await promisify(getMoreOperation.execute.bind(getMoreOperation))(server, undefined);
        expect(stub).to.have.been.calledOnceWith(
          namespace,
          sinon.match.has('maxTimeMS', options.maxAwaitTimeMS)
        );
      });

      context('comment', function () {
        const optionsWithComment = {
          ...options,
          comment: 'test'
        };

        const serverVersions = [
          {
            serverVersion: 8,
            getMore: {
              getMore: cursorId,
              collection: namespace.collection,
              batchSize: 100,
              maxTimeMS: 500
            }
          },
          {
            serverVersion: 9,
            getMore: {
              getMore: cursorId,
              collection: namespace.collection,
              batchSize: 100,
              maxTimeMS: 500,
              comment: 'test'
            }
          },
          {
            serverVersion: 10,
            getMore: {
              getMore: cursorId,
              collection: namespace.collection,
              batchSize: 100,
              maxTimeMS: 500,
              comment: 'test'
            }
          }
        ];
        for (const { serverVersion, getMore } of serverVersions) {
          const verb = serverVersion < 9 ? 'does not' : 'does';
          const state = serverVersion < 9 ? 'less than 9' : 'greater than or equal to 9';
          it(`${verb} set the comment on the command if the server wire version is ${state}`, async () => {
            const server = new Server(
              new Topology([], {} as any),
              new ServerDescription('a:1'),
              {} as any
            );
            server.hello = {
              maxWireVersion: serverVersion
            };
            const operation = new GetMoreOperation(namespace, cursorId, server, optionsWithComment);
            const stub = sinon.stub(server, 'command').yieldsRight();
            await promisify(operation.execute.bind(operation))(server, undefined);
            expect(stub).to.have.been.calledOnceWith(namespace, getMore);
          });
        }
      });
    });

    context('error cases', () => {
      const server = new Server(
        new Topology([], {} as any),
        new ServerDescription('a:1'),
        {} as any
      );
      sinon.stub(server, 'command').yieldsRight();

      it('should throw if the cursorId is undefined', async () => {
        const getMoreOperation = new GetMoreOperation(
          ns('db.collection'),
          // @ts-expect-error: Testing undefined cursorId
          undefined,
          server,
          options
        );
        const error = await promisify(getMoreOperation.execute.bind(getMoreOperation))(
          server,
          undefined
        ).catch(error => error);
        expect(error).to.be.instanceOf(MongoRuntimeError);
      });

      it('should throw if the collection is undefined', async () => {
        const getMoreOperation = new GetMoreOperation(
          ns('db'),
          Long.fromNumber(1),
          server,
          options
        );
        const error = await promisify(getMoreOperation.execute.bind(getMoreOperation))(
          server,
          undefined
        ).catch(error => error);
        expect(error).to.be.instanceOf(MongoRuntimeError);
      });

      it('should throw if the cursorId is zero', async () => {
        const getMoreOperation = new GetMoreOperation(
          ns('db.collection'),
          Long.fromNumber(0),
          server,
          options
        );
        const error = await promisify(getMoreOperation.execute.bind(getMoreOperation))(
          server,
          undefined
        ).catch(error => error);
        expect(error).to.be.instanceOf(MongoRuntimeError);
      });
    });
  });

  describe('#hasAspect', function () {
    const server = new Server(new Topology([], {} as any), new ServerDescription('a:1'), {} as any);
    const operation = new GetMoreOperation(namespace, cursorId, server, options);

    context('when the aspect is must select same server', function () {
      it('returns true', function () {
        expect(operation.hasAspect(Aspect.MUST_SELECT_SAME_SERVER)).to.be.true;
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
