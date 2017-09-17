'use strict';
var test = require('./shared').assert;
var setupDatabase = require('./shared').setupDatabase;
var assign = require('../../lib/utils').assign;
var co = require('co');
var mock = require('../mock');

var defaultFields = {
  ismaster: true,
  maxBsonObjectSize: 16777216,
  maxMessageSizeBytes: 48000000,
  maxWriteBatchSize: 1000,
  localTime: new Date(),
  maxWireVersion: 5,
  minWireVersion: 0,
  ok: 1
};

describe('Collation', function() {
  before(function() {
    return setupDatabase(this.configuration);
  });

  afterEach(() => mock.cleanup());

  it('Successfully pass through collation to findAndModify command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');
        singleServer.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.findandmodify) {
            commandResult = doc;
            request.reply({ ok: 1, result: {} });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .findAndModify(
              { a: 1 },
              [['a', 1]],
              { $set: { b1: 1 } },
              { new: true, collation: { caseLevel: true } },
              function(err) {
                test.equal(null, err);
                test.deepEqual({ caseLevel: true }, commandResult.collation);

                client.close();
                done();
              }
            );
        });
      });
    }
  });

  it('Successfully pass through collation to count command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.count) {
            commandResult = doc;
            request.reply({ ok: 1, result: { n: 1 } });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db.collection('test').count({}, { collation: { caseLevel: true } }, function(err) {
            test.equal(null, err);
            test.deepEqual({ caseLevel: true }, commandResult.collation);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Successfully pass through collation to aggregation command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.aggregate) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }], {
              collation: { caseLevel: true }
            })
            .toArray(function(err) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to distinct command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.distinct) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .distinct('a', {}, { collation: { caseLevel: true } }, function(err) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to geoNear command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.geoNear) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .geoNear(50, 50, { query: { a: 1 }, num: 1, collation: { caseLevel: true } }, function(
              err
            ) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to group command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.group) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .group(
              [],
              { a: { $gt: 1 } },
              { count: 0 },
              'function (obj, prev) { prev.count++; }',
              'function (obj, prev) { prev.count++; }',
              true,
              { collation: { caseLevel: true } },
              function(err) {
                test.equal(null, err);
                test.deepEqual({ caseLevel: true }, commandResult.collation);

                client.close();
                done();
              }
            );
        });
      });
    }
  });

  it('Successfully pass through collation to mapreduce command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Code = configuration.require.Code;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.mapreduce) {
            commandResult = doc;
            request.reply({ ok: 1, result: 'tempCollection' });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // String functions
          var map = new Code('function() { emit(this.user_id, 1); }');
          var reduce = new Code('function(k,vals) { return 1; }');

          // db.collection('test').mapReduce({
          db.collection('test').mapReduce(map, reduce, {
            out: { replace: 'tempCollection' },
            collation: { caseLevel: true }
          }, function(err) {
            test.equal(null, err);
            test.deepEqual({ caseLevel: true }, commandResult.collation);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Successfully pass through collation to remove command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.delete) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db.collection('test').deleteMany({}, { collation: { caseLevel: true } }, function(err) {
            test.equal(null, err);
            test.deepEqual({ caseLevel: true }, commandResult.deletes[0].collation);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Successfully pass through collation to update command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.update) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .updateOne({ a: 1 }, { $set: { b: 1 } }, { collation: { caseLevel: true } }, function(
              err
            ) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.updates[0].collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to find command via options', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.find) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .find({ a: 1 }, { collation: { caseLevel: true } })
            .toArray(function(err) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to find command via cursor', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.find) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .find({ a: 1 })
            .collation({ caseLevel: true })
            .toArray(function(err) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to findOne', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.find) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .findOne({ a: 1 }, { collation: { caseLevel: true } }, function(err) {
              test.equal(null, err);
              test.deepEqual({ caseLevel: true }, commandResult.collation);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Successfully pass through collation to createCollection', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        Long = configuration.require.Long;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
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
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db.createCollection('test', { collation: { caseLevel: true } }, function(err) {
            test.equal(null, err);
            test.deepEqual({ caseLevel: true }, commandResult.collation);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Fail due to no support for collation', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields, { maxWireVersion: 4 })];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.find) {
            request.reply({ ok: 1 });
          }
        });

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .findOne({ a: 1 }, { collation: { caseLevel: true } }, function(err) {
              test.equal('server localhost:32000 does not support collation', err.message);
              singleServer.destroy();
              client.close();
              done();
            });
        });
      });
    }
  });

  it('Fail command due to no support for collation', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields, { maxWireVersion: 4 })];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.find) {
            request.reply({ ok: 1 });
          }
        });

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db.command({ count: 'test', query: {}, collation: { caseLevel: true } }, function(err) {
            test.equal('server localhost:32000 does not support collation', err.message);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Successfully pass through collation to bulkWrite command', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.update) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.delete) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.collection('test').bulkWrite([
            {
              updateOne: {
                q: { a: 2 },
                u: { $set: { a: 2 } },
                upsert: true,
                collation: { caseLevel: true }
              }
            },
            { deleteOne: { q: { c: 1 } } }
          ], { ordered: true }, function(err) {
            test.equal(null, err);
            test.ok(commandResult);
            test.deepEqual({ caseLevel: true }, commandResult.updates[0].collation);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Successfully fail bulkWrite due to unsupported collation', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields, { maxWireVersion: 4 })];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.update) {
            request.reply({ ok: 1 });
          }
        });

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          db.collection('test').bulkWrite([
            {
              updateOne: {
                q: { a: 2 },
                u: { $set: { a: 2 } },
                upsert: true,
                collation: { caseLevel: true }
              }
            },
            { deleteOne: { q: { c: 1 } } }
          ], { ordered: true }, function(err) {
            test.ok(err);
            test.equal('server/primary/mongos does not support collation', err.message);

            client.close();
            done();
          });
        });
      });
    }
  });

  it('Successfully fail bulkWrite due to unsupported collation using replset', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient,
        ObjectId = configuration.require.ObjectId;

      var electionIds = [new ObjectId(), new ObjectId()];
      var rsFields = assign({}, defaultFields, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        maxWireVersion: 4,
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        assign(
          {
            ismaster: true,
            secondary: false,
            me: 'localhost:32000',
            primary: 'localhost:32000',
            tags: { loc: 'ny' }
          },
          rsFields
        )
      ];

      // Primary server states
      var firstSecondary = [
        assign(
          {
            ismaster: false,
            secondary: true,
            me: 'localhost:32001',
            primary: 'localhost:32000',
            tags: { loc: 'sf' }
          },
          rsFields
        )
      ];

      // Primary server states
      var arbiter = [
        assign(
          {
            ismaster: false,
            secondary: false,
            arbiterOnly: true,
            me: 'localhost:32002',
            primary: 'localhost:32000'
          },
          rsFields
        )
      ];

      co(function*() {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          }
        });

        setTimeout(() => {
          // Connect to the mocks
          MongoClient.connect(
            'mongodb://localhost:32000,localhost:32001/test?replicaSet=rs',
            function(err, client) {
              test.equal(null, err);
              var db = client.db(configuration.db);

              db.collection('test').bulkWrite([
                {
                  updateOne: {
                    q: { a: 2 },
                    u: { $set: { a: 2 } },
                    upsert: true,
                    collation: { caseLevel: true }
                  }
                },
                { deleteOne: { q: { c: 1 } } }
              ], { ordered: true }, function(err) {
                test.ok(err);
                test.equal('server/primary/mongos does not support collation', err.message);

                client.close();
                done();
              });
            }
          );
        }, 500);
      });
    }
  });

  it('Successfully create index with collation', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields)];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.createIndexes) {
            commandResult = doc;
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .createIndex({ a: 1 }, { collation: { caseLevel: true } }, function(err) {
              test.equal(null, err);
              test.deepEqual(
                {
                  createIndexes: 'test',
                  indexes: [{ name: 'a_1', key: { a: 1 }, collation: { caseLevel: true } }]
                },
                commandResult
              );

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Fail to create index with collation due to no capabilities', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields, { maxWireVersion: 4 })];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.createIndexes) {
            request.reply({ ok: 1 });
          }
        });

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .createIndex({ a: 1 }, { collation: { caseLevel: true } }, function(err) {
              test.ok(err);
              test.equal('server/primary/mongos does not support collation', err.message);

              client.close();
              done();
            });
        });
      });
    }
  });

  it('Fail to create indexs with collation due to no capabilities', {
    metadata: { requires: { generators: true, topology: 'single' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Primary server states
      var primary = [assign({}, defaultFields, { maxWireVersion: 4 })];

      co(function*() {
        const singleServer = yield mock.createServer(32000, 'localhost');

        // Primary state machine
        singleServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.createIndexes) {
            request.reply({ ok: 1 });
          }
        });

        // Connect to the mocks
        MongoClient.connect('mongodb://localhost:32000/test', function(err, client) {
          test.equal(null, err);
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db
            .collection('test')
            .createIndexes([{ key: { a: 1 }, collation: { caseLevel: true } }], function(err) {
              test.ok(err);
              test.equal('server/primary/mongos does not support collation', err.message);

              client.close();
              done();
            });
        });
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

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Connect to the mocks
      MongoClient.connect(configuration.url(), function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        var col = db.collection('collation_test');
        // Create collation index
        col.createIndexes(
          [{ key: { a: 1 }, collation: { locale: 'nn' }, name: 'collation_test' }],
          function(err) {
            test.equal(null, err);

            col.listIndexes().toArray(function(err, r) {
              var indexes = r.filter(function(i) {
                return i.name === 'collation_test';
              });

              test.equal(1, indexes.length);
              test.ok(indexes[0].collation);

              client.close();
              done();
            });
          }
        );
      });
    }
  });

  it('Should correctly create collection with collation', {
    metadata: { requires: { topology: 'single', mongodb: '>=3.3.12' } },

    test: function(done) {
      var configuration = this.configuration,
        MongoClient = configuration.require.MongoClient;

      // Connect to the mocks
      MongoClient.connect(configuration.url(), function(err, client) {
        test.equal(null, err);
        var db = client.db(configuration.db);

        // Simple findAndModify command returning the new document
        db.createCollection('collation_test2', { collation: { locale: 'nn' } }, function(err) {
          test.equal(null, err);

          db.listCollections({ name: 'collation_test2' }).toArray(function(err, collections) {
            test.equal(null, err);
            test.equal(1, collections.length);
            test.equal('collation_test2', collections[0].name);
            test.ok(collections[0].options.collation);

            client.close();
            done();
          });
        });
      });
    }
  });
});
