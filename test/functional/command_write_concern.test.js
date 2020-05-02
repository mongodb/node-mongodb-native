'use strict';
var test = require('./shared').assert;
var co = require('co');
var mock = require('mongodb-mock-server');

// Extend the object
var extend = function(template, fields) {
  var object = {};
  for (var name in template) {
    object[name] = template[name];
  }

  for (var fieldName in fields) {
    object[fieldName] = fields[fieldName];
  }

  return object;
};

class WriteConcernTest {
  constructor(configuration) {
    this.configuration = configuration;
    this.handlers = {};
    this.responseDecoration = {};
    const ObjectId = configuration.require.ObjectId;
    const electionIds = [new ObjectId(), new ObjectId()];
    const defaultFields = Object.assign({}, mock.DEFAULT_ISMASTER, {
      setName: 'rs',
      setVersion: 1,
      electionId: electionIds[0],
      hosts: ['localhost:32000', 'localhost:32001', 'localhost:32002'],
      arbiters: ['localhost:32002']
    });
    this.serverStates = {
      primary: [
        extend(defaultFields, {
          ismaster: true,
          secondary: false,
          me: 'localhost:32000',
          primary: 'localhost:32000',
          tags: { loc: 'ny' }
        })
      ],
      firstSecondary: [
        extend(defaultFields, {
          ismaster: false,
          secondary: true,
          me: 'localhost:32001',
          primary: 'localhost:32000',
          tags: { loc: 'sf' }
        })
      ],
      arbiter: [
        extend(defaultFields, {
          ismaster: false,
          secondary: false,
          arbiterOnly: true,
          me: 'localhost:32002',
          primary: 'localhost:32000'
        })
      ]
    };
  }
  setHandler(docKey, handler) {
    this.docKey = docKey;
    this.handler = handler;
  }
  decorateResponse(obj) {
    Object.assign(this.responseDecoration, obj);
  }
  run(resultKey, testFn) {
    const self = this;
    co(function*() {
      let primaryServer = yield mock.createServer(32000, 'localhost');
      let firstSecondaryServer = yield mock.createServer(32001, 'localhost');
      let arbiterServer = yield mock.createServer(32002, 'localhost');

      primaryServer.setMessageHandler(request => {
        var doc = request.document;
        if (doc.ismaster) {
          request.reply(self.serverStates.primary[0]);
        } else if (self.docKey && doc[self.docKey]) {
          this.handler(doc);
        } else if (doc[resultKey]) {
          self.commandResult = doc;
          request.reply(Object.assign({ ok: 1 }, self.responseDecoration));
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      firstSecondaryServer.setMessageHandler(request => {
        var doc = request.document;
        if (doc.ismaster) {
          request.reply(self.serverStates.firstSecondary[0]);
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      arbiterServer.setMessageHandler(request => {
        var doc = request.document;
        if (doc.ismaster) {
          request.reply(self.serverStates.arbiter[0]);
        } else if (doc.endSessions) {
          request.reply({ ok: 1 });
        }
      });

      const client = self.configuration.newClient(
        'mongodb://localhost:32000,localhost:32001,localhost:32002/test?replicaSet=rs'
      );

      client.connect(function(err, client) {
        test.equal(null, err);
        var db = client.db(self.configuration.db);
        testFn(client, db);
      });
    });
  }
}

describe('Command Write Concern', function() {
  afterEach(() => mock.cleanup());

  it('successfully pass through writeConcern to aggregate command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('aggregate', (client, db) => {
        db.collection('test')
          .aggregate([{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }], {
            w: 2,
            wtimeout: 1000
          })
          .toArray(function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
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

    test: function(done) {
      const Long = this.configuration.require.Long;
      const t = new WriteConcernTest(this.configuration);
      t.setHandler('listCollections', request =>
        request.reply({
          ok: 1,
          cursor: {
            id: Long.fromNumber(0),
            ns: 'test.cmd$.listCollections',
            firstBatch: []
          }
        })
      );
      t.run('create', (client, db) => {
        db.createCollection('test_collection_methods', { w: 2, wtimeout: 1000 }, function(err) {
          test.equal(null, err);
          test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

          client.close(done);
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('createIndexes', (client, db) => {
        db.collection('indexOptionDefault').createIndex(
          { a: 1 },
          {
            indexOptionDefaults: true,
            w: 2,
            wtimeout: 1000
          },
          function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
          }
        );
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('drop', (client, db) => {
        db.collection('indexOptionDefault').drop(
          {
            w: 2,
            wtimeout: 1000
          },
          function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
          }
        );
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('dropDatabase', (client, db) => {
        db.dropDatabase(
          {
            w: 2,
            wtimeout: 1000
          },
          function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
          }
        );
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('dropIndexes', (client, db) => {
        db.collection('test').dropIndexes(
          {
            w: 2,
            wtimeout: 1000
          },
          function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
          }
        );
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

    test: function(done) {
      const Code = this.configuration.require.Code;
      const t = new WriteConcernTest(this.configuration);
      t.decorateResponse({ result: 'tempCollection' });
      t.run('mapReduce', (client, db) => {
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
          function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
          }
        );
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('createUser', (client, db) => {
        db.admin().addUser('kay:kay', 'abc123', { w: 2, wtimeout: 1000 }, function(err) {
          test.equal(null, err);
          test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

          client.close(done);
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.run('dropUser', (client, db) => {
        db.admin().removeUser('kay:kay', { w: 2, wtimeout: 1000 }, function(err) {
          test.equal(null, err);
          test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

          client.close(done);
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

    test: function(done) {
      const t = new WriteConcernTest(this.configuration);
      t.decorateResponse({ result: {} });
      t.run('findAndModify', (client, db) => {
        db.collection('test').findAndModify(
          { a: 1 },
          [['a', 1]],
          { $set: { b1: 1 } },
          { new: true, w: 2, wtimeout: 1000 },
          function(err) {
            test.equal(null, err);
            test.deepEqual({ w: 2, wtimeout: 1000 }, t.commandResult.writeConcern);

            client.close(done);
          }
        );
      });
    }
  });
});
