import { expect } from 'chai';
import { ListDatabasesOperation, Db } from '../../mongodb';

describe('ListDatabasesOperation', function() {
  describe('#constructor', function() {
    context('when nameOnly is provided', function() {
      context('when nameOnly is true', function() {
        const operation = new ListDatabasesOperation({} as Db, { nameOnly: true });
        it('sets nameOnly to true', function() {
          expect(operation.options).to.have.property('nameOnly', true);
        });
      });

      context('when nameOnly is false', function() {
        const operation = new ListDatabasesOperation({} as Db, { nameOnly: false });

        it('sets nameOnly to false', function() {
          expect(operation.options).to.have.property('nameOnly', false);
        });
      });
    });

    context('when no options are provided', function() {
      const operation = new ListDatabasesOperation({} as Db, {});

      it('nameOnly is undefined', function() {
        expect(operation.options).not.to.have.property('nameOnly');
      });
    });
  });
});
