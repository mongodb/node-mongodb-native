'use strict';
const setupDatabase = require('./shared').setupDatabase;
const mock = require('../tools/mongodb-mock/index');
const expect = require('chai').expect;
const { Long, Code } = require('../../src');
const { isHello } = require('../../src/utils');

const testContext = {};
describe('Collation', function () {
  before(function () {
    return setupDatabase(this.configuration);
  });

  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => (testContext.server = mockServer));
  });

  it('Successfully pass through collation to count command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);

        return db
          .collection('test')
          .estimatedDocumentCount({ collation: { caseLevel: true } })
          .then(() => {
            expect(commandResult).to.have.property('collation');
            expect(commandResult.collation).to.eql({ caseLevel: true });
            return client.close();
          });
      });
    }
  });

  it('Successfully pass through collation to aggregation command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
      const primary = [Object.assign({}, mock.HELLO)];

      let commandResult;
      testContext.server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(primary[0]);
        } else if (doc.aggregate) {
          commandResult = doc;
          request.reply({ ok: 1, cursor: { id: 0, firstBatch: [], ns: configuration.db } });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      return client.connect().then(() => {
        const db = client.db(configuration.db);
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
    }
  });

  it('Successfully pass through collation to distinct command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);

        return db
          .collection('test')
          .distinct('a', {}, { collation: { caseLevel: true } })
          .then(() => {
            expect(commandResult).to.have.property('collation');
            expect(commandResult.collation).to.eql({ caseLevel: true });
            return client.close();
          });
      });
    }
  });

  it('Successfully pass through collation to mapReduce command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
      const primary = [Object.assign({}, mock.HELLO)];

      let commandResult;
      testContext.server.setMessageHandler(request => {
        var doc = request.document;
        if (isHello(doc)) {
          request.reply(primary[0]);
        } else if (doc.mapReduce) {
          commandResult = doc;
          request.reply({ ok: 1, result: 'tempCollection' });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      return client.connect().then(() => {
        const db = client.db(configuration.db);
        const map = new Code('function() { emit(this.user_id, 1); }');
        const reduce = new Code('function(k,vals) { return 1; }');

        return db
          .collection('test')
          .mapReduce(map, reduce, {
            out: { replace: 'tempCollection' },
            collation: { caseLevel: true }
          })
          .then(() => {
            expect(commandResult).to.have.property('collation');
            expect(commandResult.collation).to.eql({ caseLevel: true });
            return client.close();
          });
      });
    }
  });

  it('Successfully pass through collation to remove command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);
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
    }
  });

  it('Successfully pass through collation to update command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);

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
    }
  });

  it('Successfully pass through collation to find command via options', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
      const primary = [Object.assign({}, mock.HELLO)];

      let commandResult;
      testContext.server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(primary[0]);
        } else if (doc.find) {
          commandResult = doc;
          request.reply({ ok: 1, cursor: { id: 0, firstBatch: [] } });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      return client.connect().then(() => {
        const db = client.db(configuration.db);

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
    }
  });

  it('Successfully pass through collation to find command via cursor', {
    metadata: { requires: { generators: true, topology: 'single' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
      const primary = [Object.assign({}, mock.HELLO)];

      let commandResult;
      testContext.server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(primary[0]);
        } else if (doc.find) {
          commandResult = doc;
          request.reply({ ok: 1, cursor: { id: 0, firstBatch: [] } });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      return client.connect().then(() => {
        const db = client.db(configuration.db);

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
    }
  });

  it('Successfully pass through collation to findOne', {
    metadata: { requires: { generators: true, topology: 'single' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
      const primary = [Object.assign({}, mock.HELLO)];

      let commandResult;
      testContext.server.setMessageHandler(request => {
        const doc = request.document;
        if (isHello(doc)) {
          request.reply(primary[0]);
        } else if (doc.find) {
          commandResult = doc;
          request.reply({ ok: 1, cursor: { id: 0, firstBatch: [] } });
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      return client.connect().then(() => {
        const db = client.db(configuration.db);

        return db
          .collection('test')
          .findOne({ a: 1 }, { collation: { caseLevel: true } })
          .then(() => {
            expect(commandResult).to.have.property('collation');
            expect(commandResult.collation).to.eql({ caseLevel: true });

            return client.close();
          });
      });
    }
  });

  it('Successfully pass through collation to createCollection', {
    metadata: { requires: { generators: true, topology: 'single' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);

        return db.createCollection('test', { collation: { caseLevel: true } }).then(() => {
          expect(commandResult).to.have.property('collation');
          expect(commandResult.collation).to.eql({ caseLevel: true });

          return client.close();
        });
      });
    }
  });

  it('Successfully pass through collation to bulkWrite command', {
    metadata: { requires: { generators: true, topology: 'single' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);

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
    }
  });

  it('Successfully create index with collation', {
    metadata: { requires: { generators: true, topology: 'single' } },
    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient(`mongodb://${testContext.server.uri()}/test`);
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
        const db = client.db(configuration.db);

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
    }
  });

  it('cursor count method should return the correct number when used with collation set', {
    metadata: { requires: { mongodb: '>=3.4.0' } },
    test: function (done) {
      const configuration = this.configuration;
      const client = configuration.newClient({ w: 1 }, { maxPoolSize: 1 });

      client.connect().then(() => {
        const db = client.db(configuration.db);
        const docs = [
          { _id: 0, name: 'foo' },
          { _id: 1, name: 'Foo' }
        ];
        const collation = { locale: 'en_US', strength: 2 };
        let collection, cursor;
        const close = e => cursor.close(() => client.close(() => done(e)));

        Promise.resolve()
          .then(() => db.createCollection('cursor_collation_count'))
          .then(() => (collection = db.collection('cursor_collation_count')))
          .then(() => collection.insertMany(docs))
          .then(() => collection.find({ name: 'foo' }).collation(collation))
          .then(_cursor => (cursor = _cursor))
          .then(() => cursor.count())
          .then(val => expect(val).to.equal(2))
          .then(() => close())
          .catch(e => close(e));
      });
    }
  });

  /******************************************************************************
  .___        __                              __  .__
  |   | _____/  |_  ____   ________________ _/  |_|__| ____   ____
  |   |/    \   __\/ __ \ / ___\_  __ \__  \\   __\  |/  _ \ /    \
  |   |   |  \  | \  ___// /_/  >  | \// __ \|  | |  (  <_> )   |  \
  |___|___|  /__|  \___  >___  /|__|  (____  /__| |__|\____/|___|  /
          \/          \/_____/            \/                    \/
  ******************************************************************************/
  it('Should correctly create index with collation', {
    metadata: { requires: { topology: 'single', mongodb: '>=3.3.12' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(() => {
        const db = client.db(configuration.db);
        const col = db.collection('collation_test');

        return col
          .createIndexes([
            {
              key: { a: 1 },
              collation: { locale: 'nn' },
              name: 'collation_test'
            }
          ])
          .then(() => col.listIndexes().toArray())
          .then(r => {
            const indexes = r.filter(i => i.name === 'collation_test');
            expect(indexes).to.have.length(1);
            expect(indexes[0]).to.have.property('collation');
            expect(indexes[0].collation).to.exist;
            return client.close();
          });
      });
    }
  });

  it('Should correctly create collection with collation', {
    metadata: { requires: { topology: 'single', mongodb: '>=3.3.12' } },

    test: function () {
      const configuration = this.configuration;
      const client = configuration.newClient();

      return client.connect().then(() => {
        const db = client.db(configuration.db);

        return db
          .createCollection('collation_test2', { collation: { locale: 'nn' } })
          .then(() => db.listCollections({ name: 'collation_test2' }).toArray())
          .then(collections => {
            expect(collections).to.have.length(1);
            expect(collections[0].name).to.equal('collation_test2');
            expect(collections[0].options.collation).to.exist;
            return client.close();
          });
      });
    }
  });
});
