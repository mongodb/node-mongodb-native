'use strict';
const mock = require('../../tools/mongodb-mock/index');
const { expect } = require('chai');
const { Long } = require('../../mongodb');
const { isHello } = require('../../mongodb');
const { MongoClient } = require('../../mongodb');

const testContext = {};
describe('Collation', function () {
  afterEach(() => mock.cleanup());

  beforeEach(() => {
    return mock.createServer().then(mockServer => (testContext.server = mockServer));
  });

  it('Successfully pass through collation to count command', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.count) {
        commandResult = doc;
        request.reply({ ok: 1, result: { n: 1 } });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_test');

      return db
        .collection('test')
        .estimatedDocumentCount({ collation: { caseLevel: true } })
        .then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });
          return client.close();
        });
    });
  });

  it('Successfully pass through collation to aggregation command', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.aggregate) {
        commandResult = doc;
        request.reply({ ok: 1, cursor: { id: 0n, firstBatch: [], ns: 'collation_test' } });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_test');
      return db
        .collection('test')
        .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }], {
          collation: { caseLevel: true }
        })
        .toArray()
        .then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });
          return client.close();
        });
    });
  });

  it('Successfully pass through collation to distinct command', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      var doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.distinct) {
        commandResult = doc;
        request.reply({ ok: 1 });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .distinct('a', {}, { collation: { caseLevel: true } })
        .then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });
          return client.close();
        });
    });
  });

  it('Successfully pass through collation to remove command', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      var doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.delete) {
        commandResult = doc;
        request.reply({ ok: 1 });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');
      return db
        .collection('test')
        .deleteMany({}, { collation: { caseLevel: true } })
        .then(() => {
          expect(commandResult.deletes).to.have.length.at.least(1);
          expect(commandResult.deletes[0]).to.have.property('collation');
          expect(commandResult.deletes[0].collation).to.eql({ caseLevel: true });
          return client.close();
        });
    });
  });

  it('Successfully pass through collation to update command', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.update) {
        commandResult = doc;
        request.reply({ ok: 1 });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .updateOne({ a: 1 }, { $set: { b: 1 } }, { collation: { caseLevel: true } })
        .then(() => {
          expect(commandResult.updates).to.have.length.at.least(1);
          expect(commandResult.updates[0]).to.have.property('collation');
          expect(commandResult.updates[0].collation).to.eql({ caseLevel: true });

          return client.close();
        });
    });
  });

  it('Successfully pass through collation to find command via options', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.find) {
        commandResult = doc;
        request.reply({ ok: 1, cursor: { id: 0n, firstBatch: [] } });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .find({ a: 1 }, { collation: { caseLevel: true } })
        .toArray()
        .then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });
          return client.close();
        });
    });
  });

  it('Successfully pass through collation to find command via cursor', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.find) {
        commandResult = doc;
        request.reply({ ok: 1, cursor: { id: 0n, firstBatch: [] } });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .find({ a: 1 })
        .collation({ caseLevel: true })
        .toArray()
        .then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });

          return client.close();
        });
    });
  });

  it('Successfully pass through collation to findOne', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.find) {
        commandResult = doc;
        request.reply({ ok: 1, cursor: { id: 0n, firstBatch: [] } });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .findOne({ a: 1 }, { collation: { caseLevel: true } })
        .then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });

          return client.close();
        });
    });
  });

  it('Successfully pass through collation to createCollection', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.listCollections) {
        request.reply({
          ok: 1,
          cursor: {
            id: Long.fromNumber(0),
            ns: 'test.cmd$.listCollections',
            firstBatch: []
          }
        });
      } else if (doc.create) {
        commandResult = doc;
        request.reply({ ok: 1 });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db.createCollection('test', { collation: { caseLevel: true } }).then(() => {
        expect(commandResult).to.have.property('collation');
        expect(commandResult.collation).to.eql({ caseLevel: true });

        return client.close();
      });
    });
  });

  it('Successfully pass through collation to bulkWrite command', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.update) {
        commandResult = doc;
        request.reply({ ok: 1 });
      } else if (doc.delete) {
        request.reply({ ok: 1 });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .bulkWrite(
          [
            {
              updateOne: {
                filter: { a: 2 },
                update: { $set: { a: 2 } },
                upsert: true,
                collation: { caseLevel: true }
              }
            },
            { deleteOne: { filter: { c: 1 } } }
          ],
          { ordered: true }
        )
        .then(() => {
          expect(commandResult).to.exist;
          expect(commandResult).to.have.property('updates');
          expect(commandResult.updates).to.have.length.at.least(1);
          expect(commandResult.updates[0]).to.have.property('collation');
          expect(commandResult.updates[0].collation).to.eql({ caseLevel: true });

          return client.close();
        });
    });
  });

  it('Successfully create index with collation', () => {
    const client = new MongoClient(`mongodb://${testContext.server.uri()}/test`);
    const primary = [Object.assign({}, mock.HELLO)];

    let commandResult;
    testContext.server.setMessageHandler(request => {
      const doc = request.document;
      if (isHello(doc)) {
        request.reply(primary[0]);
      } else if (doc.createIndexes) {
        commandResult = doc;
        request.reply({ ok: 1 });
      } else if (doc.endSessions) {
        request.reply({ ok: 1 });
      }
    });

    return client.connect().then(() => {
      const db = client.db('collation_db');

      return db
        .collection('test')
        .createIndex({ a: 1 }, { collation: { caseLevel: true } })
        .then(() => {
          expect(commandResult).to.containSubset({
            createIndexes: 'test',
            indexes: [{ name: 'a_1', key: { a: 1 }, collation: { caseLevel: true } }]
          });

          return client.close();
        });
    });
  });
});
