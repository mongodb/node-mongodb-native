'use strict';

const { expect } = require('chai');
const { AggregateOperation } = require('../../mongodb');

describe('AggregateOperation', function () {
  const db = 'test';

  describe('#constructor', function () {
    context('when out is in the options', function () {
      const operation = new AggregateOperation(db, [], { out: 'test', dbName: db });

      it('sets trySecondaryWrite to true', function () {
        expect(operation.trySecondaryWrite).to.be.true;
      });
    });

    context('when $out is the last stage', function () {
      const operation = new AggregateOperation(db, [{ $out: 'test' }], { dbName: db });

      it('sets trySecondaryWrite to true', function () {
        expect(operation.trySecondaryWrite).to.be.true;
      });
    });

    context('when $out is not the last stage', function () {
      const operation = new AggregateOperation(db, [{ $out: 'test' }, { $project: { name: 1 } }], {
        dbName: db
      });

      it('sets trySecondaryWrite to false', function () {
        expect(operation.trySecondaryWrite).to.be.false;
      });
    });

    context('when $merge is the last stage', function () {
      const operation = new AggregateOperation(db, [{ $merge: { into: 'test' } }], { dbName: db });

      it('sets trySecondaryWrite to true', function () {
        expect(operation.trySecondaryWrite).to.be.true;
      });
    });

    context('when $merge is not the last stage', function () {
      const operation = new AggregateOperation(
        db,
        [{ $merge: { into: 'test' } }, { $project: { name: 1 } }],
        { dbName: db }
      );

      it('sets trySecondaryWrite to false', function () {
        expect(operation.trySecondaryWrite).to.be.false;
      });
    });

    context('when no writable stages in empty pipeline', function () {
      const operation = new AggregateOperation(db, [], { dbName: db });

      it('sets trySecondaryWrite to false', function () {
        expect(operation.trySecondaryWrite).to.be.false;
      });
    });

    context('when no writable stages', function () {
      const operation = new AggregateOperation(db, [{ $project: { name: 1 } }], { dbName: db });

      it('sets trySecondaryWrite to false', function () {
        expect(operation.trySecondaryWrite).to.be.false;
      });
    });
  });
});
