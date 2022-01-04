'use strict';

const { expect } = require('chai');
const { MongoClient } = require('../../../src');
const { AggregateOperation } = require('../../../src/operations/aggregate');
const { isHello } = require('../../../src/utils');
const { HELLO, cleanup, createServer } = require('../../tools/mongodb-mock');

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

  context('bypass validation', () => {
    const test = {};
    beforeEach(() =>
      createServer().then(server => {
        test.server = server;
      })
    );
    afterEach(() => cleanup());

    // general test for aggregate function
    function testAggregate(config, done) {
      const client = new MongoClient(`mongodb://${test.server.uri()}/test`);
      let close = e => {
        close = () => {};
        client.close(() => done(e));
      };

      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.aggregate) {
          try {
            expect(doc.bypassDocumentValidation).equal(config.expected);
            request.reply({
              ok: 1,
              cursor: {
                firstBatch: [{}],
                id: 0,
                ns: 'test.test'
              }
            });
          } catch (e) {
            close(e);
          }
        }

        if (isHello(doc)) {
          request.reply(Object.assign({}, HELLO));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      client.connect(function (err, client) {
        expect(err).to.not.exist;
        const db = client.db('test');
        const collection = db.collection('test_c');

        const options = { bypassDocumentValidation: config.actual };

        const pipeline = [
          {
            $project: {}
          }
        ];
        collection.aggregate(pipeline, options).next(() => close());
      });
    }
    // aggregate
    it('should only set bypass document validation if strictly true in aggregate', function (done) {
      testAggregate({ expected: true, actual: true }, done);
    });

    it('should not set bypass document validation if not strictly true in aggregate', function (done) {
      testAggregate({ expected: undefined, actual: false }, done);
    });
  });
});
