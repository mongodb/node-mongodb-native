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
          expect(operation).to.have.property('nameOnly', true);
        });
      });

      context('when nameOnly is false', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: false, dbName: db });

        it('sets nameOnly to false', function () {
          expect(operation).to.have.property('nameOnly', false);
        });
      });
    });

    context('when authorizedCollections is provided', function () {
      context('when authorizedCollections is true', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: true, dbName: db }
        );

        it('sets authorizedCollections to true', function () {
          expect(operation).to.have.property('authorizedCollections', true);
        });
      });

      context('when authorizedCollections is false', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: false, dbName: db }
        );

        it('sets authorizedCollections to false', function () {
          expect(operation).to.have.property('authorizedCollections', false);
        });
      });
    });

    context('when no options are provided', function () {
      const operation = new ListCollectionsOperation(db, {}, { dbName: db });

      it('sets nameOnly to false', function () {
        expect(operation).to.have.property('nameOnly', false);
      });

      it('sets authorizedCollections to false', function () {
        expect(operation).to.have.property('authorizedCollections', false);
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
            nameOnly: true,
            authorizedCollections: false
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
            nameOnly: false,
            authorizedCollections: false
          });
        });
      });
    });

    context('when authorizedCollections is provided', function () {
      context('when authorizedCollections is true', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: true, dbName: db }
        );

        it('sets authorizedCollections to true', function () {
          expect(operation.generateCommand()).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: false,
            authorizedCollections: true
          });
        });
      });

      context('when authorizedCollections is false', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: false, dbName: db }
        );

        it('sets authorizedCollections to false', function () {
          expect(operation.generateCommand()).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: false,
            authorizedCollections: false
          });
        });
      });
    });

    context('when no options are provided', function () {
      const operation = new ListCollectionsOperation(db, {}, { dbName: db });

      it('sets nameOnly and authorizedCollections properties to false', function () {
        expect(operation.generateCommand()).to.deep.equal({
          listCollections: 1,
          cursor: {},
          filter: {},
          nameOnly: false,
          authorizedCollections: false
        });
      });
    });
  });
});
