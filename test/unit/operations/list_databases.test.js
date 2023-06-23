'use strict';

const { expect } = require('chai');

const { ListDatabasesOperation } = require('../../mongodb');

describe('ListDatabasesOperation', function () {
  const db = 'test';

  describe('#constructor', function () {
    context('when nameOnly is provided', function () {
      context('when nameOnly is true', function () {
        const operation = new ListDatabasesOperation(db, { nameOnly: true });
        it('sets nameOnly to true', function () {
          expect(operation.options).to.have.property('nameOnly', true);
        });
      });

      context('when nameOnly is false', function () {
        const operation = new ListDatabasesOperation({}, { nameOnly: false });

        it('sets nameOnly to false', function () {
          expect(operation.options).to.have.property('nameOnly', false);
        });
      });
    });

    context('when no options are provided', function () {
      const operation = new ListDatabasesOperation(db, {});

      it('sets nameOnly to false', function () {
        expect(operation.options).to.have.property('nameOnly', false);
      });
    });
  });
});
