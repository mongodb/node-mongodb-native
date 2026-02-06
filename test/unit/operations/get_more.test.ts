import { Long } from 'bson';
import { expect } from 'chai';

import {
  Aspect,
  GetMoreOperation,
  ns,
  ReadPreference,
  Server,
  ServerDescription
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('GetMoreOperation', function () {
  const namespace = ns('db.coll');
  const cursorId = Object.freeze(Long.fromNumber(1));
  const options = {
    batchSize: 100,
    maxAwaitTimeMS: 500,
    readPreference: ReadPreference.primary
  };

  describe('#constructor', function () {
    const topology = topologyWithPlaceholderClient([], {} as any);
    const server = new Server(topology, new ServerDescription('a:1'), {} as any);
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

  context('command construction', () => {
    const cursorId = Long.fromBigInt(0xffff_ffffn);
    const namespace = ns('db.collection');
    const server = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );

    it('should build getMore command with maxTimeMS if maxAwaitTimeMS specified', async () => {
      const options = {
        maxAwaitTimeMS: 234
      };
      const getMoreOperation = new GetMoreOperation(namespace, cursorId, server, options);
      const { maxTimeMS } = getMoreOperation.buildCommand({
        description: {}
      } as any);
      expect(maxTimeMS).to.equal(234);
    });

    context('error cases', () => {
      const server = new Server(
        topologyWithPlaceholderClient([], {} as any),
        new ServerDescription('a:1'),
        {} as any
      );

      it('should throw if the cursorId is undefined', async () => {
        const getMoreOperation = new GetMoreOperation(
          ns('db.collection'),
          undefined,
          server,
          options
        );
        const connection = {
          description: {}
        } as any;
        expect(() => {
          getMoreOperation.buildCommand(connection);
        }).to.throw(/Unable to iterate cursor with no id/);
      });

      it('should throw if the collection is undefined', async () => {
        const getMoreOperation = new GetMoreOperation(
          ns('db'),
          Long.fromNumber(1),
          server,
          options
        );
        const connection = {
          description: {}
        } as any;
        expect(() => {
          getMoreOperation.buildCommand(connection);
        }).to.throw(/A collection name must be determined before getMore/);
      });

      it('should throw if the cursorId is zero', async () => {
        const getMoreOperation = new GetMoreOperation(
          ns('db.collection'),
          Long.fromNumber(0),
          server,
          options
        );
        const connection = {
          description: {}
        } as any;
        expect(() => {
          getMoreOperation.buildCommand(connection);
        }).to.throw(/Unable to iterate cursor with no id/);
      });
    });
  });

  describe('#hasAspect', function () {
    const server = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );
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
