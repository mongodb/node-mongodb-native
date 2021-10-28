'use strict';

const { expect } = require('chai');
const { ListCollectionsOperation } = require('../../../src/operations/list_collections');

describe('ListCollectionsOperation', function () {
  const db = 'test';

  describe('#constructor', function () {
    context('when nameOnly is provided', function () {
      context('when nameOnly is true', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: true, dbName: db });

        it('sets nameOnly to true', function () {
          expect(operation.nameOnly).to.be.true;
        });
      });

      context('when nameOnly is false', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: false, dbName: db });

        it('sets nameOnly to false', function () {
          expect(operation.nameOnly).to.be.false;
        });
      });
    });

    context('when nameOnly is not provided', function () {
      const operation = new ListCollectionsOperation(db, {}, { dbName: db });

      it('sets nameOnly to false', function () {
        expect(operation.nameOnly).to.be.false;
      });
    });
  });

  describe('#generateCommand', function () {
    context('when nameOnly is provided', function () {
      context('when nameOnly is true', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: true, dbName: db });

        it('sets nameOnly to true', function () {
          expect(operation.generateCommand()).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: true
          });
        });
      });

      context('when nameOnly is false', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: false, dbName: db });

        it('sets nameOnly to false', function () {
          expect(operation.generateCommand()).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: false
          });
        });
      });
    });

    context('when nameOnly is not provided', function () {
      const operation = new ListCollectionsOperation(db, {}, { dbName: db });

      it('sets nameOnly to false', function () {
        expect(operation.generateCommand()).to.deep.equal({
          listCollections: 1,
          cursor: {},
          filter: {},
          nameOnly: false
        });
      });
    });
  });
});
