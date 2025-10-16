import { expect } from 'chai';

import { WriteConcern } from '../../../src';
import { AggregateOperation } from '../../../src/operations/aggregate';
import { MongoDBNamespace } from '../../../src/utils';

describe('AggregateOperation', function () {
  const ns = new MongoDBNamespace('test', 'coll');

  describe('#constructor', function () {
    context('when out is in the options', function () {
      const operation = new AggregateOperation(ns, [], { out: 'test', dbName: ns.db });

      it('sets hasWriteStage to true', function () {
        expect(operation.hasWriteStage).to.be.true;
      });
    });

    context('when $out is the last stage', function () {
      const operation = new AggregateOperation(ns, [{ $out: 'test' }], { dbName: ns.db });

      it('sets hasWriteStage to true', function () {
        expect(operation.hasWriteStage).to.be.true;
      });
    });

    context('when $out is not the last stage', function () {
      const operation = new AggregateOperation(ns, [{ $out: 'test' }, { $project: { name: 1 } }], {
        dbName: ns.db
      });

      it('sets hasWriteStage to false', function () {
        expect(operation.hasWriteStage).to.be.false;
      });
    });

    context('when $merge is the last stage', function () {
      const operation = new AggregateOperation(ns, [{ $merge: { into: 'test' } }], {
        dbName: ns.db
      });

      it('sets hasWriteStage to true', function () {
        expect(operation.hasWriteStage).to.be.true;
      });
    });

    context('when $merge is not the last stage', function () {
      const operation = new AggregateOperation(
        ns,
        [{ $merge: { into: 'test' } }, { $project: { name: 1 } }],
        { dbName: ns.db }
      );

      it('sets hasWriteStage to false', function () {
        expect(operation.hasWriteStage).to.be.false;
      });
    });

    context('when no writable stages in empty pipeline', function () {
      const operation = new AggregateOperation(ns, [], { dbName: ns.db });

      it('sets hasWriteStage to false', function () {
        expect(operation.hasWriteStage).to.be.false;
      });
    });

    context('when no writable stages', function () {
      const operation = new AggregateOperation(ns, [{ $project: { name: 1 } }], { dbName: ns.db });

      it('sets hasWriteStage to false', function () {
        expect(operation.hasWriteStage).to.be.false;
      });
    });

    context('when explain is set', function () {
      context('when writeConcern is set', function () {
        const operation = new AggregateOperation(ns, [], {
          dbName: ns.db,
          explain: true,
          writeConcern: WriteConcern.fromOptions({ wtimeoutMS: 1000 })
        });

        it('does not raise an error', function () {
          expect(operation.explain).to.exist;
        });
      });
    });
  });
});
