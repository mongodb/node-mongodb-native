import { expect } from 'chai';

import { isHello, MongoClient } from '../mongodb';
import { cleanup, createServer, HELLO } from '../tools/mongodb-mock';

describe('Collection', function () {
  let server = null;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await cleanup();
  });

  context('#aggregate', () => {
    // general test for aggregate function
    function testAggregate(config, done) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);
      let close = e => {
        close = () => null;
        client.close(() => done(e));
      };

      server.setMessageHandler(request => {
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
        collection.aggregate(pipeline, options).next(() => close(null));
      });
    }

    context('bypass document validation', () => {
      it('should only set bypass document validation if strictly true in aggregate', function (done) {
        testAggregate({ expected: true, actual: true }, done);
      });

      it('should not set bypass document validation if not strictly true in aggregate', function (done) {
        testAggregate({ expected: undefined, actual: false }, done);
      });
    });
  });

  context('#findOneAndModify', () => {
    function testFindOneAndUpdate(config, done) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);
      let close = e => {
        close = () => null;
        client.close(() => done(e));
      };

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.findAndModify) {
          try {
            expect(doc.bypassDocumentValidation).equal(config.expected);
            request.reply({
              ok: 1
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

        collection.findOneAndUpdate({ name: 'Andy' }, { $inc: { score: 1 } }, options, e => {
          close(e);
        });
      });
    }

    it('should only set bypass document validation if strictly true in findOneAndUpdate', function (done) {
      testFindOneAndUpdate({ expected: true, actual: true }, done);
    });

    it('should not set bypass document validation if not strictly true in findOneAndUpdate', function (done) {
      testFindOneAndUpdate({ expected: undefined, actual: false }, done);
    });
  });

  context('#bulkWrite', () => {
    function testBulkWrite(config, done) {
      const client = new MongoClient(`mongodb://${server.uri()}/test`);
      let close = e => {
        close = () => null;
        client.close(() => done(e));
      };

      server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.insert) {
          try {
            expect(doc.bypassDocumentValidation).equal(config.expected);
            request.reply({
              ok: 1
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

        const options = {
          bypassDocumentValidation: config.actual,
          ordered: config.ordered
        };

        collection.bulkWrite([{ insertOne: { document: { a: 1 } } }], options, () => close(null));
      });
    }
    // ordered bulk write, testing change in ordered.js
    it('should only set bypass document validation if strictly true in ordered bulkWrite', function (done) {
      testBulkWrite({ expected: true, actual: true, ordered: true }, done);
    });

    it('should not set bypass document validation if not strictly true in ordered bulkWrite', function (done) {
      testBulkWrite({ expected: undefined, actual: false, ordered: true }, done);
    });

    // unordered bulk write, testing change in ordered.js
    it('should only set bypass document validation if strictly true in unordered bulkWrite', function (done) {
      testBulkWrite({ expected: true, actual: true, ordered: false }, done);
    });

    it('should not set bypass document validation if not strictly true in unordered bulkWrite', function (done) {
      testBulkWrite({ expected: undefined, actual: false, ordered: false }, done);
    });
  });
});
