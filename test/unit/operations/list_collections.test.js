'use strict';
const { expect } = require('chai');
const { ListCollectionsOperation } = require('../../mongodb');

describe('ListCollectionsOperation', function () {
  const db = 'test';

  describe('#constructor', function () {
    describe('when nameOnly is provided', function () {
      describe('when nameOnly is true', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: true, dbName: db });

        it('sets nameOnly to true', function () {
          expect(operation).to.have.property('nameOnly', true);
        });
      });

      describe('when nameOnly is false', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: false, dbName: db });

        it('sets nameOnly to false', function () {
          expect(operation).to.have.property('nameOnly', false);
        });
      });
    });

    describe('when authorizedCollections is provided', function () {
      describe('when authorizedCollections is true', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: true, dbName: db }
        );

        it('sets authorizedCollections to true', function () {
          expect(operation).to.have.property('authorizedCollections', true);
        });
      });

      describe('when authorizedCollections is false', function () {
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

    describe('when no options are provided', function () {
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
    describe('when comment is provided', function () {
      describe('when the wireVersion < 9', function () {
        it('does not set a comment on the command', function () {
          const operation = new ListCollectionsOperation(
            db,
            {},
            { dbName: db, comment: 'test comment' }
          );
          const command = operation.generateCommand(8);
          expect(command).not.to.haveOwnProperty('comment');
        });
      });

      describe('when the wireVersion >= 9', function () {
        it('sets a comment on the command', function () {
          const operation = new ListCollectionsOperation(
            db,
            {},
            { dbName: db, comment: 'test comment' }
          );
          const command = operation.generateCommand(9);
          expect(command).to.have.property('comment').that.equals('test comment');
        });
      });
    });

    describe('when nameOnly is provided', function () {
      describe('when nameOnly is true', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: true, dbName: db });

        it('sets nameOnly to true', function () {
          expect(operation.generateCommand(8)).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: true,
            authorizedCollections: false
          });
        });
      });

      describe('when nameOnly is false', function () {
        const operation = new ListCollectionsOperation(db, {}, { nameOnly: false, dbName: db });

        it('sets nameOnly to false', function () {
          expect(operation.generateCommand(8)).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: false,
            authorizedCollections: false
          });
        });
      });
    });

    describe('when authorizedCollections is provided', function () {
      describe('when authorizedCollections is true', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: true, dbName: db }
        );

        it('sets authorizedCollections to true', function () {
          expect(operation.generateCommand(8)).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: false,
            authorizedCollections: true
          });
        });
      });

      describe('when authorizedCollections is false', function () {
        const operation = new ListCollectionsOperation(
          db,
          {},
          { authorizedCollections: false, dbName: db }
        );

        it('sets authorizedCollections to false', function () {
          expect(operation.generateCommand(8)).to.deep.equal({
            listCollections: 1,
            cursor: {},
            filter: {},
            nameOnly: false,
            authorizedCollections: false
          });
        });
      });
    });

    describe('when no options are provided', function () {
      const operation = new ListCollectionsOperation(db, {}, { dbName: db });

      it('sets nameOnly and authorizedCollections properties to false', function () {
        expect(operation.generateCommand(8)).to.deep.equal({
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
