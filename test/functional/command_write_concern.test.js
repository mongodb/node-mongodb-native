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

function withStubbedClient(testFn) {
  return function(done) {
    const t = new WriteConcernTest(this.configuration);
    testFn.call(this, t, done);
  };
}

const writeConcernTestOptions = { w: 2, wtimeout: 1000 };

function writeConcernTest(command, testFn) {
  return withStubbedClient(function(t, done) {
    switch (command) {
      case 'mapReduce':
        t.decorateResponse({ result: 'tempCollection' });
        break;
    }
    t.run(command, (client, db) =>
      testFn.call(this, db, Object.assign({}, writeConcernTestOptions), err => {
        test.equal(null, err);
        test.deepEqual(writeConcernTestOptions, t.commandResult.writeConcern);
        client.close(done);
      })
    );
  });
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

    test: writeConcernTest('aggregate', function(db, writeConcernTestOptions, done) {
      db.collection('test')
        .aggregate(
          [{ $match: {} }, { $out: 'readConcernCollectionAggregate1Output' }],
          writeConcernTestOptions
        )
        .toArray(done);
    })
  });

  it('successfully pass through writeConcern to create command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('create', function(db, writeConcernTestOptions, done) {
      db.createCollection('test_collection_methods', writeConcernTestOptions, done);
    })
  });

  it('successfully pass through writeConcern to createIndexes command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('createIndexes', function(db, writeConcernTestOptions, done) {
      db.collection('indexOptionDefault').createIndex(
        { a: 1 },
        Object.assign({ indexOptionDefaults: true }, writeConcernTestOptions),
        done
      );
    })
  });

  it('successfully pass through writeConcern to drop command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('drop', function(db, writeConcernTestOptions, done) {
      db.collection('indexOptionDefault').drop(writeConcernTestOptions, done);
    })
  });

  it('successfully pass through writeConcern to dropDatabase command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('dropDatabase', function(db, writeConcernTestOptions, done) {
      db.dropDatabase(writeConcernTestOptions, done);
    })
  });

  it('successfully pass through writeConcern to dropIndexes command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('dropIndexes', function(db, writeConcernTestOptions, done) {
      db.collection('test').dropIndexes(writeConcernTestOptions, done);
    })
  });

  it('successfully pass through writeConcern to mapReduce command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('mapReduce', function(db, writeConcernTestOptions, done) {
      const Code = this.configuration.require.Code;
      const map = new Code('function() { emit(this.user_id, 1); }');
      const reduce = new Code('function(k,vals) { return 1; }');
      db.collection('test').mapReduce(
        map,
        reduce,
        Object.assign({ out: { replace: 'tempCollection' } }, writeConcernTestOptions),
        done
      );
    })
  });

  it('successfully pass through writeConcern to createUser command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('createUser', function(db, writeConcernTestOptions, done) {
      db.admin().addUser('kay:kay', 'abc123', writeConcernTestOptions, done);
    })
  });

  it('successfully pass through writeConcern to dropUser command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('dropUser', function(db, writeConcernTestOptions, done) {
      db.admin().removeUser('kay:kay', writeConcernTestOptions, done);
    })
  });

  it('successfully pass through writeConcern to findAndModify command', {
    metadata: {
      requires: {
        generators: true,
        topology: 'single'
      }
    },

    test: writeConcernTest('findAndModify', function(db, writeConcernTestOptions, done) {
      db.collection('test').findAndModify(
        { a: 1 },
        [['a', 1]],
        { $set: { b1: 1 } },
        Object.assign({ new: true }, writeConcernTestOptions),
        done
      );
    })
  });
});
