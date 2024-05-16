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
    describe('when nameOnly is provided', function () {
      describe('when nameOnly is true', function () {
        it('sets nameOnly to true', function () {
          const operation = new ListDatabasesOperation(mockDB, { nameOnly: true });
          expect(operation.options).to.have.property('nameOnly', true);
        });
      });

      describe('when nameOnly is false', function () {
        it('sets nameOnly to false', function () {
          const operation = new ListDatabasesOperation(mockDB, { nameOnly: false });
          expect(operation.options).to.have.property('nameOnly', false);
        });
      });
    });

    describe('when nameOnly is not specified', function () {
      it('nameOnly is undefined', function () {
        const operation = new ListDatabasesOperation(mockDB, {});
        expect(operation.options).not.to.have.property('nameOnly');
      });
    });
  });
});
