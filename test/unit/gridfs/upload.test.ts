import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  checkChunksIndex,
  checkIndexes,
  type GridFSBucketWriteStream,
  MongoError,
  MONGODB_ERROR_CODES
} from '../../mongodb';

const listIndexesRejecting = (error: Error) =>
  sinon.stub().returns({ toArray: sinon.stub().rejects(error) });

const mongoErrorNamespaceNotFound = Object.assign(new MongoError('x'), {
  code: MONGODB_ERROR_CODES.NamespaceNotFound
});
const mongoErrorOther = Object.assign(new MongoError('x'), {
  code: MONGODB_ERROR_CODES.HostUnreachable
});
const nonMongoErrorNamespaceNotFound = Object.assign(new Error('x'), {
  code: MONGODB_ERROR_CODES.NamespaceNotFound
});

describe('GridFS upload', function () {
  describe('checkChunksIndex()', function () {
    context('when listing indexes fails with a MongoError indicating NamespaceNotFound', function () {
      it('creates the chunks index', async function () {
        const createIndex = sinon.stub().resolves();
        const chunks = {
          listIndexes: listIndexesRejecting(mongoErrorNamespaceNotFound),
          createIndex
        };

        await checkChunksIndex({ chunks } as unknown as GridFSBucketWriteStream);

        expect(createIndex.calledOnce).to.equal(true);
      });
    });

    context('when listing indexes fails with a MongoError not indicating NamespaceNotFound', function () {
      it('rethrows the error', async function () {
        const chunks = { listIndexes: listIndexesRejecting(mongoErrorOther) };

        const thrown = await checkChunksIndex({ chunks } as unknown as GridFSBucketWriteStream).catch(e => e);

        expect(thrown).to.equal(mongoErrorOther);
      });
    });

    context('when listing indexes fails with a non-MongoError indicating NamespaceNotFound', function () {
      it('rethrows the error', async function () {
        const chunks = { listIndexes: listIndexesRejecting(nonMongoErrorNamespaceNotFound) };

        const thrown = await checkChunksIndex({ chunks } as unknown as GridFSBucketWriteStream).catch(e => e);

        expect(thrown).to.equal(nonMongoErrorNamespaceNotFound);
      });
    });
  });

  describe('checkIndexes()', function () {
    context('when listing indexes fails with a MongoError indicating NamespaceNotFound', function () {
      it('creates the files index and then calls checkChunksIndex', async function () {
        const createIndex = sinon.stub().resolves();
        const files = {
          findOne: sinon.stub().resolves(null),
          listIndexes: listIndexesRejecting(mongoErrorNamespaceNotFound),
          createIndex
        };
        const chunks = {
          listIndexes: sinon.stub().returns({ toArray: sinon.stub().resolves([]) }),
          createIndex: sinon.stub().resolves()
        };

        await checkIndexes({ chunks, files } as unknown as GridFSBucketWriteStream);

        expect(createIndex.calledOnce).to.equal(true);
        expect(chunks.listIndexes.calledOnce).to.equal(true);
      });
    });

    context('when listing indexes fails with a MongoError not indicating NamespaceNotFound', function () {
      it('rethrows the error without calling checkChunksIndex', async function () {
        const files = {
          findOne: sinon.stub().resolves(null),
          listIndexes: listIndexesRejecting(mongoErrorOther)
        };
        const chunks = { listIndexes: sinon.stub() };

        const thrown = await checkIndexes({ chunks, files } as unknown as GridFSBucketWriteStream).catch(e => e);

        expect(thrown).to.equal(mongoErrorOther);
        expect(chunks.listIndexes.called).to.equal(false);
      });
    });

    context('when listing indexes fails with a non-MongoError indicating NamespaceNotFound', function () {
      it('rethrows the error without calling checkChunksIndex', async function () {
        const files = {
          findOne: sinon.stub().resolves(null),
          listIndexes: listIndexesRejecting(nonMongoErrorNamespaceNotFound)
        };
        const chunks = { listIndexes: sinon.stub() };

        const thrown = await checkIndexes({ chunks, files } as unknown as GridFSBucketWriteStream).catch(e => e);

        expect(thrown).to.equal(nonMongoErrorNamespaceNotFound);
        expect(chunks.listIndexes.called).to.equal(false);
      });
    });
  });
});
