import { expect } from 'chai';

import {
  DropCollectionOperation,
  MongoClient,
  MONGODB_ERROR_CODES,
  MongoError,
  MongoServerError
} from '../../mongodb';

describe('DropCollectionOperation', function () {
  describe('#handleError()', function () {
    // An unconnected client; nothing here touches the network.
    const db = new MongoClient('mongodb://localhost:27017').db('test');

    context(
      'when the error is a MongoServerError with code indicating NamespaceNotFound',
      function () {
        it('returns false', function () {
          const operation = new DropCollectionOperation(db, 'c');
          const error = new MongoServerError({
            errmsg: 'x',
            code: MONGODB_ERROR_CODES.NamespaceNotFound
          });

          expect(operation.handleError(error)).to.equal(false);
        });
      }
    );

    context(
      'when the error is a MongoServerError without code indicating NamespaceNotFound',
      function () {
        it('rethrows the error', function () {
          const operation = new DropCollectionOperation(db, 'c');
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
          const operation = new DropCollectionOperation(db, 'c');
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
