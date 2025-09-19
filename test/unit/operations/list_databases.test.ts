import { expect } from 'chai';
import { MongoDBNamespace } from '../../../src/utils';
import { ListDatabasesOperation } from '../../../src/operations/list_databases';

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
        it('sets nameOnly to true', function () {
          const operation = new ListDatabasesOperation(mockDB, { nameOnly: true });
          expect(operation.options).to.have.property('nameOnly', true);
        });
      });

      context('when nameOnly is false', function () {
        it('sets nameOnly to false', function () {
          const operation = new ListDatabasesOperation(mockDB, { nameOnly: false });
          expect(operation.options).to.have.property('nameOnly', false);
        });
      });
    });

    context('when nameOnly is not specified', function () {
      it('nameOnly is undefined', function () {
        const operation = new ListDatabasesOperation(mockDB, {});
        expect(operation.options).not.to.have.property('nameOnly');
      });
    });
  });
});
