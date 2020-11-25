'use strict';
var test = require('./shared').assert;
var co = require('co');
var mock = require('mongodb-mock-server');
const { ObjectId, Long, Code } = require('../../src');
const { expect } = require('chai');

// Extend the object
var extend = function (template, fields) {
  var object = {};
  for (var name in template) {
    object[name] = template[name];
  }

  for (var fieldName in fields) {
    object[fieldName] = fields[fieldName];
  }

  return object;
};

describe('Command Write Concern', function () {
  afterEach(() => mock.cleanup());

  it('successfully pass through writeConcern to aggregate command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        let primaryServer = yield mock.createServer(32000, 'localhost');
        let firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        let arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.aggregate) {
            commandResult = doc;
            request.reply({ ok: 1, cursor: { id: 0, firstBatch: [], ns: configuration.db } });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.collection('test')
            .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }], {
              w: 2,
              wtimeout: 1000
            })
            .toArray(function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            });
        });
      });
    }
  });

  it('successfully pass through writeConcern to create command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
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
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.createCollection('test_collection_methods', { w: 2, wtimeout: 1000 }, function (err) {
            expect(err).to.not.exist;
            test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

            client.close(done);
          });
        });
      });
    }
  });

  it('successfully pass through writeConcern to createIndexes command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;

          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.createIndexes) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.collection('indexOptionDefault').createIndex(
            { a: 1 },
            {
              indexOptionDefaults: true,
              w: 2,
              wtimeout: 1000
            },
            function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            }
          );
        });
      });
    }
  });

  it('successfully pass through writeConcern to drop command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.drop) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.collection('indexOptionDefault').drop(
            {
              w: 2,
              wtimeout: 1000
            },
            function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            }
          );
        });
      });
    }
  });

  it('successfully pass through writeConcern to dropDatabase command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.dropDatabase) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.dropDatabase(
            {
              w: 2,
              wtimeout: 1000
            },
            function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            }
          );
        });
      });
    }
  });

  it('successfully pass through writeConcern to dropIndexes command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.dropIndexes) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.collection('test').dropIndexes(
            {
              w: 2,
              wtimeout: 1000
            },
            function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            }
          );
        });
      });
    }
  });

  it('successfully pass through writeConcern to mapReduce command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.mapReduce) {
            commandResult = doc;
            request.reply({ ok: 1, result: 'tempCollection' });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          // String functions
          var map = new Code('function() { emit(this.user_id, 1); }');
          var reduce = new Code('function(k,vals) { return 1; }');

          // db.collection('test').mapReduce({
          db.collection('test').mapReduce(
            map,
            reduce,
            {
              out: { replace: 'tempCollection' },
              w: 2,
              wtimeout: 1000
            },
            function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            }
          );
        });
      });
    }
  });

  it('successfully pass through writeConcern to createUser command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.createUser) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.admin().addUser('kay:kay', 'abc123', { w: 2, wtimeout: 1000 }, function (err) {
            expect(err).to.not.exist;
            test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

            client.close(done);
          });
        });
      });
    }
  });

  it('successfully pass through writeConcern to dropUser command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.dropUser) {
            commandResult = doc;
            request.reply({ ok: 1 });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          db.admin().removeUser('kay:kay', { w: 2, wtimeout: 1000 }, function (err) {
            expect(err).to.not.exist;
            test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

            client.close(done);
          });
        });
      });
    }
  });

  it('successfully pass through writeConcern to findAndModify command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function (done) {
      var configuration = this.configuration;
      var electionIds = [new ObjectId(), new ObjectId()];
      var defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
        setName: 'rs',
        setVersion: 1,
        electionId: electionIds[0],
        hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
        arbiters: ['localhost:32002']
      });

      // Primary server states
      var primary = [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ];

      // Primary server states
      var firstSecondary = [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ];

      // Primary server states
      var arbiter = [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ];

      // Boot the mock
      co(function* () {
        const primaryServer = yield mock.createServer(32000, 'localhost');
        const firstSecondaryServer = yield mock.createServer(32001, 'localhost');
        const arbiterServer = yield mock.createServer(32002, 'localhost');

        primaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(primary[0]);
          } else if (doc.findAndModify) {
            commandResult = doc;
            request.reply({ ok: 1, result: {} });
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        firstSecondaryServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(firstSecondary[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        arbiterServer.setMessageHandler(request => {
          var doc = request.document;
          if (doc.ismaster) {
            request.reply(arbiter[0]);
          } else if (doc.endSessions) {
            request.reply({ ok: 1 });
          }
        });

        var commandResult = null;

        // Connect to the mocks
        const client = configuration.newClient(
          'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
        );

        client.connect(function (err, client) {
          expect(err).to.not.exist;
          var db = client.db(configuration.db);

          // Simple findAndModify command returning the new document
          db.collection('test').findAndModify(
            { a: 1 },
            [['a', 1]],
            { $set: { b1: 1 } },
            { new: true, w: 2, wtimeout: 1000 },
            function (err) {
              expect(err).to.not.exist;
              test.deepEqual({ w: 2, wtimeout: 1000 }, commandResult.writeConcern);

              client.close(done);
            }
          );
        });
      });
    }
  });
});
