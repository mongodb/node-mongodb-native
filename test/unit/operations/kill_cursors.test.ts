import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  KillCursorsOperation,
  Long,
  MongoDBNamespace,
  MongoRuntimeError,
  ns,
  Server,
  ServerDescription
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('class KillCursorsOperation', () => {
  afterEach(function () {
    sinon.restore();
  });

  describe('constructor()', () => {
    const cursorId = Long.fromBigInt(0xffff_ffffn);
    const namespace = ns('db.collection');
    const server = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );
    const options = {};
    const killCursorsOperation = new KillCursorsOperation(cursorId, namespace, server, options);

    it('defines ns', () => {
      expect(killCursorsOperation).to.have.property('ns').that.is.instanceOf(MongoDBNamespace);
    });

    it('defines cursorId', () => {
      expect(killCursorsOperation).to.have.property('cursorId').that.is.instanceOf(Long);
    });

    it('defines server', () => {
      expect(killCursorsOperation).to.have.property('server').that.is.instanceOf(Server);
    });
  });

  describe('execute()', () => {
    const cursorId = Long.fromBigInt(0xffff_ffffn);
    const namespace = ns('db.collection');
    const server = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );
    const differentServer = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );
    const options = {};

    it('should throw if the server defined from the constructor changes', async () => {
      const killCursorsOperation = new KillCursorsOperation(
        cursorId,
        namespace,
        server,
        options
      ) as any;

      const error = await killCursorsOperation
        .execute(differentServer, undefined)
        .catch(error => error);

      expect(error).to.be.instanceOf(MongoRuntimeError);
    });

    it('should throw if the namespace does not define a collection', async () => {
      const killCursorsOperation = new KillCursorsOperation(
        cursorId,
        ns('db'),
        server,
        options
      ) as any;

      const error = await killCursorsOperation.execute(server, undefined).catch(error => error);

      expect(error).to.be.instanceOf(MongoRuntimeError);
    });

    it('should construct a killCursors command', async () => {
      const killCursorsOperation = new KillCursorsOperation(
        cursorId,
        namespace,
        server,
        options
      ) as any;
      const stub = sinon.stub(server, 'command').returns(Promise.resolve({}));
      await killCursorsOperation.execute(server, undefined);
      expect(stub).to.have.been.calledOnceWith(namespace, {
        killCursors: namespace.collection,
        cursors: [cursorId]
      });
    });
  });
});
