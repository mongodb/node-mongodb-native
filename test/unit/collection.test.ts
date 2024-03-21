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

  context('#createIndex', () => {
    it('should error when createIndex fails', function (done) {
      const ERROR_RESPONSE = {
        ok: 0,
        errmsg:
          'WiredTigerIndex::insert: key too large to index, failing  1470 { : "56f37cb8e4b089e98d52ab0e", : "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..." }',
        code: 17280
      };

      server.setMessageHandler(request => {
        const doc = request.document;

        if (isHello(doc)) {
          return request.reply(Object.assign({}, HELLO));
        }

        if (doc.createIndexes) {
          return request.reply(ERROR_RESPONSE);
        }

        if (doc.insert === 'system.indexes') {
          return request.reply(ERROR_RESPONSE);
        }
      });

      const client = new MongoClient(`mongodb://${server.uri()}`);

      const close = e => client.close().then(() => done(e));

      client
        .connect()
        .then(() => client.db('foo').collection('bar'))
        .then(coll => coll.createIndex({ a: 1 }))
        .then(
          () => close('Expected createIndex to fail, but it succeeded'),
          e => {
            try {
              expect(e).to.have.property('ok', ERROR_RESPONSE.ok);
              expect(e).to.have.property('errmsg', ERROR_RESPONSE.errmsg);
              expect(e).to.have.property('code', ERROR_RESPONSE.code);
              close(null);
            } catch (err) {
              close(err);
            }
          }
        );
    });
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
