import { expect } from 'chai';

import { ListDatabasesOperation, MongoDBNamespace } from '../../mongodb';

const mockDB = {
  s: {
    namespace: {
      withCollection() {
        return new MongoDBNamespace('test', 'test');
      }
    }
  }
};

describe('ListDatabasesOperation', function () {
  describe('#constructor', function () {
    context('when nameOnly is provided', function () {
      context('when nameOnly is true', function () {
        const operation = new ListDatabasesOperation(mockDB, { nameOnly: true });
        it('sets nameOnly to true', function () {
          expect(operation.options).to.have.property('nameOnly', true);
        });
      });

      context('when nameOnly is false', function () {
        const operation = new ListDatabasesOperation(mockDB, { nameOnly: false });

        it('sets nameOnly to false', function () {
          expect(operation.options).to.have.property('nameOnly', false);
        });
      });
    });

    context('when nameOnly is not specified', function () {
      const operation = new ListDatabasesOperation(mockDB, {});

      it('nameOnly is undefined', function () {
        expect(operation.options).not.to.have.property('nameOnly');
      });
    });
  });
});
