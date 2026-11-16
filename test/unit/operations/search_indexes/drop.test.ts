import { expect } from 'chai';

import {
  DropSearchIndexOperation,
  MongoClient,
  MONGODB_ERROR_CODES,
  MongoError,
  MongoServerError
} from '../../../mongodb';

describe('DropSearchIndexOperation', function () {
  describe('#handleError()', function () {
    // An unconnected client; nothing here touches the network.
    const collection = new MongoClient('mongodb://localhost:27017').db('test').collection('c');

    context(
      'when the error is a MongoServerError with code indicating NamespaceNotFound',
      function () {
        it('does not throw', function () {
          const operation = new DropSearchIndexOperation(collection, 'idx');
          const error = new MongoServerError({
            errmsg: 'x',
            code: MONGODB_ERROR_CODES.NamespaceNotFound
          });

          expect(() => operation.handleError(error)).to.not.throw();
        });
      }
    );

    context(
      'when the error is a MongoServerError without code indicating NamespaceNotFound',
      function () {
        it('rethrows the error', function () {
          const operation = new DropSearchIndexOperation(collection, 'idx');
          const error = new MongoServerError({
            errmsg: 'x',
            code: MONGODB_ERROR_CODES.HostUnreachable
          });

          let thrown: unknown;
          try {
            operation.handleError(error);
          } catch (e) {
            thrown = e;
          }

          expect(thrown).to.equal(error);
        });
      }
    );

    context(
      'when the error is not a MongoServerError, with code indicating NamespaceNotFound',
      function () {
        it('rethrows the error', function () {
          const operation = new DropSearchIndexOperation(collection, 'idx');
          const error = Object.assign(new MongoError('x'), {
            code: MONGODB_ERROR_CODES.NamespaceNotFound
          });

          let thrown: unknown;
          try {
            operation.handleError(error);
          } catch (e) {
            thrown = e;
          }

          expect(thrown).to.equal(error);
        });
      }
    );
  });
});
