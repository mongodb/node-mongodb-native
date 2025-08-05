import { expect } from 'chai';

import {
  KillCursorsOperation,
  Long,
  MongoDBNamespace,
  ns,
  Server,
  ServerDescription
} from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('class KillCursorsOperation', () => {
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
    const server = new Server(
      topologyWithPlaceholderClient([], {} as any),
      new ServerDescription('a:1'),
      {} as any
    );
    const options = {};

    it('should throw if the namespace does not define a collection', async () => {
      const killCursorsOperation = new KillCursorsOperation(cursorId, ns('db'), server, options);

      const connection = {
        description: {}
      } as any;
      expect(() => {
        killCursorsOperation.buildCommand(connection);
      }).to.throw(/A collection name must be determined before killCursors/);
    });
  });
});
