import { expect } from 'chai';
import * as sinon from 'sinon';
import { promisify } from 'util';

import { FindOperation, ns, Server, ServerDescription } from '../../mongodb';
import { topologyWithPlaceholderClient } from '../../tools/utils';

describe('FindOperation', function () {
  const namespace = ns('db.coll');
  const options = {
    batchSize: 100
  };
  const filter = {
    ts: { $gt: new Date() }
  };

  afterEach(function () {
    sinon.restore();
  });

  describe('#constructor', function () {
    const operation = new FindOperation(undefined, namespace, filter, options);

    it('sets the namespace', function () {
      expect(operation.ns).to.deep.equal(namespace);
    });

    it('sets options', function () {
      expect(operation.options).to.deep.equal(options);
    });

    it('sets filter', function () {
      expect(operation.filter).to.deep.equal(filter);
    });
  });

  describe('#execute', function () {
    context('command construction', () => {
      const namespace = ns('db.collection');
      const topology = topologyWithPlaceholderClient([], {} as any);
      const server = new Server(topology, new ServerDescription('a:1'), {} as any);

      it('should build basic find command with filter', async () => {
        const findOperation = new FindOperation(undefined, namespace, filter);
        const stub = sinon.stub(server, 'command').yieldsRight();
        await promisify(findOperation.executeCallback.bind(findOperation))(server, undefined);
        expect(stub).to.have.been.calledOnceWith(namespace, {
          find: namespace.collection,
          filter
        });
      });

      it('should build find command with oplogReplay', async () => {
        const options = {
          oplogReplay: true
        };
        const findOperation = new FindOperation(undefined, namespace, {}, options);
        const stub = sinon.stub(server, 'command').yieldsRight();
        await promisify(findOperation.executeCallback.bind(findOperation))(server, undefined);
        expect(stub).to.have.been.calledOnceWith(
          namespace,
          sinon.match.has('oplogReplay', options.oplogReplay)
        );
      });
    });
  });
});
